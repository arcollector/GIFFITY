/**
* UTILS
*/
var setInt = function( arrayBuffer, start, value ) {
    arrayBuffer[start] = value & 0xff;
    arrayBuffer[start+1] = (value >> 8);
};

/**
* CODE
*/
var DEBUG = false;

const FILE_TERMINATOR = 59; // ';'
const EXTENSION_SEPARATOR = 33; // '!'
const GRAPHICS_CONTROL_LABEL = 249; // 0xf9
const APPLICATION_LABEL = 255; // 0xff
const IMAGE_SEPARATOR = 44; // ','

var createHeader = function( options ) {

    var header = new Uint8Array( options.palette ? 13 + (1 << options.colorBits) * 3 : 13 );

    var signature = 'GIF89a'.split( '' );
    for( var i = 0; i < 6; i++ ) {
        header[i] = signature[i].charCodeAt( 0 );
    }

    setInt( header, 6, options.canvasWidth );
    setInt( header, 8, options.canvasHeight );

    // 7-bit is global palette flag
    // 6-4bits is bits per pixel, where bits is store as N-1
    // 3-bit is palette sort flag, it can be omitted without regrets
    // 0-2bits is size of the palette in the following form 2^(N+1), you need
    // only store N as N-1
    header[10] = (options.palette ? (1<<7) : 0) | ((options.colorBits - 1) << 6) | (options.palette ? options.colorBits - 1 : 0);

    header[11] = options.backgroundColorIndex;

    // header[12] is the aspect ratio, it can be omitted without regrets

    if( options.palette ) {
        for( var i = 0, paletteSize = (1 << options.colorBits) * 3, j = 13; i < paletteSize; i++, j++ ) {
            header[j] = options.palette[i];
        }
    }

    return header;
};

var createGraphicsControlExtension = function( options ) {

    var graphicsControlExtension = new Uint8Array( 8 );

    graphicsControlExtension[0] = EXTENSION_SEPARATOR;
    graphicsControlExtension[1] = GRAPHICS_CONTROL_LABEL;

    graphicsControlExtension[2] = 4; // always is 4 bytes count

    // 4-2bits is disposal method
    // 1-bit is user input flag, it can be omitted without regrets
    // 0-bit is transparent color flag
    graphicsControlExtension[3] = (options.disposalMethod << 2) | (options.transparentColorFlag ? 1 : 0);

    setInt( graphicsControlExtension, 4, options.delayTime );

    graphicsControlExtension[6] = options.transparentColorFlag ? options.transparentColorIndex : 0;

    // graphicsControlExtension[7] is the block terminator (x00)

    return graphicsControlExtension;
};

var createNestscapeApplicationExtension = function() {

    var netscapeApplicationExtension = new Uint8Array( 19 );

    netscapeApplicationExtension[0] = EXTENSION_SEPARATOR;
    netscapeApplicationExtension[1] = APPLICATION_LABEL;

    var netscapeStr = 'NETSCAPE2.0'.split( '' );
    netscapeApplicationExtension[2] = 11; // NETSCAPE2.0 char length
    for( var i = 0, j = 3; i < 11; i++, j++ ) {
        netscapeApplicationExtension[j] = netscapeStr[i].charCodeAt( 0 );
    }

    netscapeApplicationExtension[14] = 3; // byte count follwing
    netscapeApplicationExtension[15] = 1; // always 1
    setInt( netscapeApplicationExtension, 16, 0 ); // 0 to make endless animation

    return netscapeApplicationExtension;
};

var createImageBlock = function( options ) {

    var imageBlock = new Uint8Array( options.palette ? 10 + (1 << options.colorBits) * 3 : 10 );

    imageBlock[0] = IMAGE_SEPARATOR;

    setInt( imageBlock, 1, options.left );
    setInt( imageBlock, 3, options.top );
    setInt( imageBlock, 5, options.width );
    setInt( imageBlock, 7, options.height );

    // 7-bit local palette flag
    // 6-bit interlace flag
    // 5-bit sort flag, it can be omitted without regrets
    // 0-2bits size of local palette
    imageBlock[9] = (options.palette ? (1<<7) : 0) | (options.isInterlaced ? (1<<6) : 0) | (options.palette ? options.colorBits - 1 : 0);

    if( options.palette ) {
        for( var i = 0, paletteSize = (1 << options.colorBits) * 3, j = 10; i < paletteSize; i++, j++ ) {
            imageBlock[j] = options.palette[i];
        }
    }

    return imageBlock;
};

const COLOR_INDEX_NOT_IN_PALETTE = -1;
const END_OF_IMAGE_DATA = -2;

var compressImageData = function( options ) {

    var imageData = options.imageData;

    var imageDataLength = options.canvasWidth*options.canvasHeight*4;
    var imageDataStartingIndex = options.top*options.canvasWidth*4 + options.left*4;
	var imageDataIndex = imageDataStartingIndex;

    var codeTableIndex;
    var codeTable = {};

    var LZWMinCodeSize = options.LZWMinCodeSize === 1 ? 2 : options.LZWMinCodeSize;

    var clearCode = 1 << LZWMinCodeSize;
    var endOfInformationCode = clearCode + 1;

    // palette to dict
    var paletteDict = {};
    // because GIF file only support 256 colors using a color indexes scheme
    // we need a mapping mechanism to translate from a RGB color value
    // to an index color value, // ie: 255,255,255 -> 0
    for( var i = 0, l = options.palette.length, colorIndex = 0; i < l; colorIndex++ ) {
        var colorDictIndex = options.palette[i++]+','+options.palette[i++]+','+options.palette[i++];
        if( colorDictIndex in paletteDict ) {
            console.warn( 'palette with repeated color', colorDictIndex );
        } else {
            paletteDict[colorDictIndex] = colorIndex;
        }
    }

    var bitsShifter = 0;
    var bitsCount = 0;
    var bitsThreshold = LZWMinCodeSize + 1;
    var curMaxCode = (1 << bitsThreshold) - 1;

    var codeStream = new Uint8Array( options.width * options.height * 3 );
    codeStream[0] = LZWMinCodeSize; // before anything save the LZWMinCodeSize!!!
    // you start at 2, because you need to make room for the first byte count byte
    var codeStreamIndex = 2;
    var byteCount = 0;

    // used for interlaced
    var incTable = new Uint8Array( [ 8,8,4,2,0 ] );
	var startTable = new Uint8Array( [ 0,4,2,1,0 ] );
    var pass = 0;
    var curWidth = 0;
    var curRow = 0;

    var getColorIndex = function() {
        if( curWidth === options.width ) {
            if( options.isInterlaced ) {
                curRow += incTable[pass];
                if( curRow >= options.height ) {
                    curRow = startTable[++pass];
                }
                imageDataIndex = (imageDataStartingIndex = (options.top + curRow)*options.canvasWidth*4 + options.left*4);
            } else {
                curRow++;
                imageDataIndex = (imageDataStartingIndex += options.canvasWidth*4);
            }
            curWidth = 0;
        }
        if( curRow >= options.height || imageDataIndex >= imageDataLength || pass === 4 ) {
            return END_OF_IMAGE_DATA;
        }
        curWidth++;
        var colorDictIndex = imageData[imageDataIndex++]+','+imageData[imageDataIndex++]+','+imageData[imageDataIndex++];
        imageDataIndex++;
        if( !(colorDictIndex in paletteDict) ) {
            console.error( 'color rgb', colorDictIndex, 'does not exist in palette' );
            return COLOR_INDEX_NOT_IN_PALETTE;
        }
        return paletteDict[colorDictIndex];
    };

    var writeCode = function( code ) {
        codeStream[codeStreamIndex] |= (code << bitsShifter);
        var bitsCount = 8 - bitsShifter;
        if( bitsCount < bitsThreshold ) { // need more bytes to save the code
            for( ; ; bitsCount += 8 ) {
                byteCount++;
                codeStream[++codeStreamIndex] = ((code >> bitsCount) & 255);
                if( bitsCount + 8 >= bitsThreshold ) {
                    break;
                }
            }
            bitsShifter = bitsThreshold - bitsCount;
        } else {
            bitsShifter += bitsThreshold;
        }
        if( bitsShifter === 8 ) { // move to the next byte
            bitsShifter = 0;
            byteCount++;
            codeStreamIndex++;
        }
        // byteCount is only incremented when a full byte (ie: its 8 bits has been completely used)
        if( byteCount >= 255 ) {
            byteCount -= 255;
            // note the i <= byteCount in the for loop, you always have to reallocate at least one byte
            // to make room for the next byte count byte of the incoming sub block
            for( var i = 0, j = codeStreamIndex; i <= byteCount; i++, j-- ) { // reallocate overflowed bytes
                codeStream[j+1] = codeStream[j];
            }
            // write the byte count at the begginning of this image compressed sub-block
            codeStream[codeStreamIndex - byteCount - 256] = 255;
            codeStreamIndex++; // increment by one, becuase you have reallocated at least one byte
        }
        if( code === endOfInformationCode ) {
            // setup the remaining sub block, remember how byteCount is incremented,
            // so maybe a partial byte is been used but still not completed, bitsShifter will tell us
            // this information, in this case byteCount need to be incremented by one unit to include
            // this partial used byte
            var inc = bitsShifter > 0 ? 1 : 0;
            codeStream[codeStreamIndex - byteCount - 1] = byteCount + inc;
            codeStreamIndex += inc; // make room for the block terminator code
        }
    };

    // Always start by sending a clear code to the code stream.
    writeCode( clearCode );
    var wasClearCode = true;

    // Read first index from index stream.
    var prevK = getColorIndex();
    if( prevK === COLOR_INDEX_NOT_IN_PALETTE ) {
        return null;
    }
    var k;
    var stringCode;

    for(;;) {

        if( wasClearCode ) {
            // reset table
            codeTableIndex = 1 << LZWMinCodeSize;
            codeTable = {};
            for( var i = 0; i < codeTableIndex; i++ ) {
                codeTable[i] = i;
            }
            codeTableIndex += 2;
            // reset theses also
            bitsThreshold = LZWMinCodeSize + 1;
            curMaxCode = (1 << bitsThreshold) - 1;

            wasClearCode = false;
            continue;
        }

        k = getColorIndex();
        if( k === COLOR_INDEX_NOT_IN_PALETTE ) {
            return null;
        } else if( k === END_OF_IMAGE_DATA ) {
            break;
        }

        if( options.isUncompressed ) {
            writeCode( prevK );
            prevK = k;
            if( codeTableIndex === curMaxCode ) {
                writeCode( clearCode );
                wasClearCode = true;
            }
            codeTableIndex++;
            continue;
        }

        stringCode = prevK + ',' + k;
        if( stringCode in codeTable ) {
            // get the code that refers to this string code
            prevK = codeTable[stringCode];
        } else {
            // make a new entry
            codeTable[stringCode] = codeTableIndex;
            // write prevK
            writeCode( prevK );
            // save k for the next round
            prevK = k;

            if( codeTableIndex > curMaxCode ) {
                if( bitsThreshold === 12 ) { // reset table
                    writeCode( clearCode );
                    wasClearCode = true;
                    //DEBUG && console.log( 'resseting bitsThreshold' );
                } else {
                    curMaxCode = (1 << ++bitsThreshold) - 1;
                    //DEBUG && console.log( 'increment bitsThreshold to', bitsThreshold );
                }
            }
            codeTableIndex++;
        }
    }

    writeCode( prevK );
    writeCode( endOfInformationCode );

    // add null terminator (0x00)
    codeStream[codeStreamIndex++] = 0;

    //DEBUG && console.log( codeTable );

    return codeStream.subarray( 0, codeStreamIndex );
};

var createFile = function( options ) {

    if( options.canvasWidth > 0xFFFF || options.canvasHeight > 0xFFFF || options.canvasWidth <= 0 || options.canvasHeight <= 0 ) {
        console.error( 'canvas image rect too large, maximum dimension is', 0xFFFF );
        return null;
    }

    var globalColorBits = options.colorBits || 0;
    if( globalColorBits && ( globalColorBits < 1 || globalColorBits > 8 ) ) {
        console.error( 'colorBits bad value:', globalColorBits );
        return null;
    }
    var globalPalette = options.palette || null;
    if( globalPalette ) {
        var paletteSize = ( 1 << globalColorBits ) * 3;
        if( globalPalette.length < paletteSize ) {
            console.error( 'global palette length is erroneous' );
            return null;
        }
    }

    var header = createHeader( {
        canvasWidth: options.canvasWidth,
        canvasHeight: options.canvasHeight,
        colorBits: globalColorBits,
        palette: globalPalette,
        backgroundColorIndex: options.backgroundColorIndex || 0,
    } );

    var bitmaps = options.bitmaps;
    if( !Array.isArray( bitmaps ) || bitmaps.length === 0 ) {
	console.error( 'missing bitmaps' );
	return null;
    }

    var netscapeApplicationExtension = null;
    if( bitmaps.length > 1 ) { // more than 1 image means an animated gif
        netscapeApplicationExtension = createNestscapeApplicationExtension(); // create animation block
    }
    var netscapeApplicationExtensionLength = ( netscapeApplicationExtension ? netscapeApplicationExtension.length : 0 );

    var compressedImages = [];
    var compressedImagesLength = 0;
    for( var i = 0, l = bitmaps.length; i < l; i++ ) {
        var bitmap = bitmaps[i];

        var localColorBits = bitmap.colorBits || 0;
        if( localColorBits && ( localColorBits < 1 || localColorBits > 8 ) ) {
            console.error( 'colorBits bad value:', localColorBits, 'at image num', i );
            return null;
        }

        var localPalette = bitmap.palette || null;
        if( !localPalette && !globalPalette ) { // we need a palette!!
            console.error( 'missing a palette at image num', i );
            return null;
        }
        if( localPalette ) {
            var paletteSize = ( 1 << localColorBits ) * 3;
            if( localPalette.length < paletteSize ) {
                console.error( 'local palette length is erroneous at image num', i );
                return null;
            }
        }

        if( bitmap.width > options.canvasWidth || bitmap.height > options.canvasHeight || bitmap.width < 0 || bitmap.height < 0 ) {
            console.error( 'image dimensions are larger than the canvas dimensions' );
            return null;
        }
        bitmap.width = bitmap.width || 0;
        bitmap.height = bitmap.height || 0;
        if( bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width > options.canvasWidth || bitmap.height > options.canvasHeight ) {
            console.error( 'bad image num', i, 'dimensions' );
            return null;
        }
        bitmap.left = bitmap.left || 0;
        bitmap.top = bitmap.top || 0;
        if( bitmap.left + bitmap.width > options.canvasWidth || bitmap.top + bitmap.height > options.canvasHeight || bitmap.left < 0 || bitmap.top < 0 ) {
            console.error( 'image left/top parameters are overflowed' );
            return null;
        }

        if( bitmap.isInterlaced && bitmap.height < 5 ) {
            console.warn( 'interlaced does not work in in such small image (less than 5 pixels height)' );
            bitmap.isInterlaced = false;
        }

        var graphicsControlExtension = createGraphicsControlExtension( {
            delayTime: bitmap.delayTime || 0,
            transparentColorFlag: bitmap.transparentColorFlag || false,
            transparentColorIndex: bitmap.transparentColorFlag ? bitmap.transparentColorIndex : 0,
            disposalMethod: bitmap.disposalMethod || 0,
        } );

        var isInterlaced = bitmap.isInterlaced || false;

        var imageBlock = createImageBlock( {
            top: bitmap.top,
            left: bitmap.left,
            width: bitmap.width,
            height: bitmap.height,
            palette: localPalette || null,
            colorBits: localPalette ? localColorBits : globalColorBits,
            isInterlaced: isInterlaced
        } );

        var compressedImageData = compressImageData( {
            imageData: bitmap.imageData,
            palette: localPalette || globalPalette, // localPalette takes precendence
            top: bitmap.top || 0,
            left: bitmap.left || 0,
            width: bitmap.width,
            height: bitmap.height,
            canvasWidth: options.canvasWidth,
            canvasHeight: options.canvasHeight,
            LZWMinCodeSize: localPalette ? localColorBits : globalColorBits,
            isInterlaced: isInterlaced,
            isUncompressed: bitmap.isUncompressed || false,
        } );
        if( !compressedImageData ) {
            return null;
        }
        //console.log( compressedImageData );
        // calc graphics control extension + image block + compressed image bytes length
        var compressedImageLength = graphicsControlExtension.length + imageBlock.length + compressedImageData.length;
        // join graphics control extension, image block and compressed image
        var compressedImage = new Uint8Array( compressedImageLength );
        compressedImage.set( graphicsControlExtension, 0 );
        compressedImage.set( imageBlock, graphicsControlExtension.length );
        compressedImage.set( compressedImageData, graphicsControlExtension.length + imageBlock.length );

        // keep adding images block
        compressedImages.push( compressedImage );

        // keep recording the lengths
        compressedImagesLength += compressedImageLength;
    }

    // build the file (header + nestcape extension + images block + file terminator code)
    var file = new Uint8Array( header.length + netscapeApplicationExtensionLength + compressedImagesLength + 1 );
    file.set( header, 0 );
    netscapeApplicationExtension && file.set( netscapeApplicationExtension, header.length );
    for( var i = 0, l = compressedImages.length, j = header.length + netscapeApplicationExtensionLength; i < l; j += compressedImages[i].length, i++ ) {
        file.set( compressedImages[i], j );
    }
    file[file.length-1] = FILE_TERMINATOR; // file terminator (;)

    //console.log( file, file.length );
    return file;
};

/**
* MAIN
*/
DEBUG = true;

self.addEventListener( 'message', function( e ) {
    var args = e.data;
    var file = createFile( args.options );
    self.postMessage( file );
} );
