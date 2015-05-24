/**
* UTILS
*/
var openFile = function( filenameURL, callback ) {
	var xhr = new XMLHttpRequest();
	xhr.open( 'GET', filenameURL );
	xhr.responseType = 'arraybuffer';
	xhr.onload = function( e ) {
		var data = this.response;
		if( !data ) {
			console.error( 'fail to open file', filenameURL );
			callback( null );
		} else {
			callback( new Uint8Array( data ) );
		}
	};
	xhr.onerror = function( e ) {
		console.error( 'file doesn\'t exits', filenameURL );
		callback( null );
	};
	xhr.send();
};

var bytes2String = function( arrayBuffer, start, count ) {
	var str = [];
	for( var i = start, j = 0; j < count; i++, j++ ) {
		str[j] = String.fromCharCode( arrayBuffer[i] );
	}
	return str.join( '' );
};

var getInt = function( arrayBuffer, start ) {
	return arrayBuffer[start] | (arrayBuffer[start+1] << 8);
};

/**
* CODE
*/
var DEBUG = false;

const GRAPHICS_CONTROL_EXTENSION = 1;
const APPLICATION_EXTENSION = 2;
const PLAIN_TEXT_EXTENSION = 3;
const COMMENT_EXTENSION = 4;
const UNKNOWN_EXTENSION = 5;

const DM_NO_ACTION = 0;
const DM_RESTORE_BACKGROUND = 2;
const DM_OVERDRAW_PICTURE = 1;
const DM_OVERDRAW_PICTURE_2 = 3;

/**
* DECODING
*/
var grabPalette = function( arrayBuffer, palette, start, colorCount ) {
	for( var i = start, j = 0, k = 0; j < colorCount; j++ ) {
		palette[k++] = arrayBuffer[i++]; // r
		palette[k++] = arrayBuffer[i++]; // g
		palette[k++] = arrayBuffer[i++]; // b
	}
};

var getHeader = function( arrayBuffer, header ) {

	if( bytes2String( arrayBuffer, 0, 3 ) !== 'GIF' ) {
		console.log( 'this isn\'t a GIF file' );
		return false;
	}

	header.version = bytes2String( arrayBuffer, 3, 3 );
	header.canvasWidth = getInt( arrayBuffer, 6 );
	header.canvasHeight = getInt( arrayBuffer, 8 );

	var globalFlag = arrayBuffer[10];
	header.colorBits = (globalFlag & 7) + 1;
	header.colorCount = 1 << header.colorBits;
	if( globalFlag & 0x80 ) {
		var paletteSize = 3*header.colorCount;
		header.palette = new Uint8Array( paletteSize );
		grabPalette( arrayBuffer, header.palette, 13, header.colorCount );
		header.nextBlockAddress = 13 + paletteSize;
	} else {
		header.nextBlockAddress = 13;
	}

	header.backgroundColorIndex = arrayBuffer[11];
	header.aspectRatio = arrayBuffer[12];
	if( header.aspectRatio ) {
		header.aspectRatio = (header.aspectRatio + 15) / 64;
	}

	return true;
};

var processExtensionBlock = function( arrayBuffer, start ) {

	if( bytes2String( arrayBuffer, start, 1 ) !== '!' ) { // '!' === 33
		console.log( 'not extension block present' );
		return null;
	}

	if( arrayBuffer[start+1] === 0xf9 ) { // graphics control
		var graphicsControlExtension = {};
		graphicsControlExtension.type = GRAPHICS_CONTROL_EXTENSION;
		// omit arrayBuffer[start+2] because is always 4
		graphicsControlExtension.packedField = arrayBuffer[start+3];
		graphicsControlExtension.transparentColorFlag = (graphicsControlExtension.packedField & 1) === 1;
		graphicsControlExtension.useInputFlag = (graphicsControlExtension.packedField & 2) === 2;
		graphicsControlExtension.disposalMethod = (graphicsControlExtension.packedField >> 2) & 7;
		graphicsControlExtension.delayTime = getInt( arrayBuffer, start + 4 );
		graphicsControlExtension.transparentColorIndex = arrayBuffer[start+6];
		// omit arrayBuffer[start+7] because is the block terminator
		graphicsControlExtension.nextBlockAddress = start + 8;
		return graphicsControlExtension;

	} else if( arrayBuffer[start+1] === 0xff ) { // application extension
		var applicationExtension = {};
		applicationExtension.type = APPLICATION_EXTENSION;
		var byteCount = arrayBuffer[start+2];
		var applicationIdentifier = [];
		for( var i = start + 3, j = byteCount; j; i++, j-- ) {
			applicationIdentifier.push( String.fromCharCode( arrayBuffer[i] ) );
		}
		applicationExtension.applicationIdentifier = applicationIdentifier.join( '' );
		if( applicationExtension.applicationIdentifier === 'NETSCAPE2.0' ) {
			// omit arrayBuffer[start+3+byteCount] because is always 3
			// omit arrayBuffer[start+3+byteCount+1] because is always 1
			applicationExtension.loopCount = getInt( arrayBuffer, start + 3 + byteCount + 2 );
			// omit arrayBuffer[start+3+byteCount+4] because is the block terminator
			applicationExtension.nextBlockAddress = start + 3 + byteCount + 5;
		} else {
			console.warn( 'unknow application extension identifier', applicationExtension.applicationIdentifier );
			// eat reaming bytes
			var offset = start + 2 + byteCount + 1;
			var totalByteCount = offset + (byteCount = arrayBuffer[offset]);
			while( byteCount !== 0 ) {
				offset += byteCount + 1;
				byteCount = arrayBuffer[offset];
				totalByteCount += byteCount + 1;
			}
			// + 1 to put the nextBlockAddress after the terminator identifier
			applicationExtension.nextBlockAddress = totalByteCount + 1;
		}
		return applicationExtension;

	} else if( arrayBuffer[start+1] === 0x01 ) { // plain text extension
		var plainTextExtension = {};
		plainTextExtension.type = PLAIN_TEXT_EXTENSION;
		// omit arrayBuffer[start+2] because is always 12
		plainTextExtension.textGridLeftPosition = getInt( arrayBuffer, start + 3 );
		plainTextExtension.textGridTopPosition = getInt( arrayBuffer, start + 5 );
		plainTextExtension.textGridWidth = getInt( arrayBuffer, start + 7 );
		plainTextExtension.textGridHeight = getInt( arrayBuffer, start + 9 );
		plainTextExtension.characterCellWidth = arrayBuffer[start+11];
		plainTextExtension.characterCellHeight = arrayBuffer[start+12];
		plainTextExtension.textForegroundColorIndex = arrayBuffer[start+13];
		plainTextExtension.textBackgroundColorIndex = arrayBuffer[start+14];
		var text = [];
		var byteCount = arrayBuffer[start+15];
		var offset = start + 16;
		for( ; ; offset++, byteCount-- ) {
			if( byteCount === 0 ) {
				byteCount = arrayBuffer[offset++];
				if( byteCount === 0 ) {
					break;
				}
			}
			text.push( String.fromCharCode( arrayBuffer[offset] ) );
		}
		plainTextExtension.text = text.join( '' );
		plainTextExtension.nextBlockAddress = offset; // +1 to omit the block terminator
		return plainTextExtension;

	} else if( arrayBuffer[start+1] === 0xfe ) { // comment extension
		var comment = [];
		var byteCount = arrayBuffer[start+2];
		var offset = start + 3;
		for( ; ; offset++, byteCount-- ) {
			if( byteCount === 0 ) {
				byteCount = arrayBuffer[offset++];
				if( byteCount === 0 ) {
					break;
				}
			}
			comment.push( String.fromCharCode( arrayBuffer[offset] ) );
		}
		var commentExtension = {};
		commentExtension.type = COMMENT_EXTENSION;
		commentExtension.comment = comment.join( '' );
		commentExtension.nextBlockAddress = offset;
		return commentExtension;
	}

	console.error( 'unknown extension code:', arrayBuffer[start+1] );
	var unknownExtension = {};
	unknownExtension.type = UNKNOWN_EXTENSION;
	return null;
};

var getImageBlock = function( arrayBuffer, start, header, graphicsControlExtension ) {

	if( bytes2String( arrayBuffer, start, 1 ) !== ',' ) { // 44 === ','
		console.log( 'not image present' );
		return null;
	}

	var imageBlock = {};
	imageBlock.left = getInt( arrayBuffer, start+1 );
	imageBlock.top = getInt( arrayBuffer, start+3 );
	imageBlock.width = getInt( arrayBuffer, start+5 );
	imageBlock.height = getInt( arrayBuffer, start+7 );
	var localFlag = arrayBuffer[start+9];
	if( localFlag & 0x80 ) { // imageBlock has its own palette data
		DEBUG&&console.log( 'image has its own palette data' );
		imageBlock.colorBits = (localFlag & 7) + 1;
		imageBlock.colorCount = 1 << imageBlock.colorBits;
		var paletteSize = 3*imageBlock.colorCount;
		imageBlock.palette = new Uint8Array( paletteSize );
		grabPalette( arrayBuffer, imageBlock.palette, start + 10, imageBlock.colorCount );
		imageBlock.compressImageAddress = start + 10 + paletteSize;
	} else { // use header palette data
		imageBlock.colorBits = header.colorBits;
		imageBlock.colorCount = header.colorCount;
		imageBlock.palette = header.palette;
		imageBlock.compressImageAddress = start + 10;
	}
	imageBlock.isInterlaced = (localFlag & 0x40) == 0x40;
	imageBlock.imageData = null; // store here the image in <canvas> image data format
	imageBlock.nextBlockAddress = 0; // to setup in the decompress process
	// needed for animation and transparency
	if( graphicsControlExtension ) {
		imageBlock.delayTime = graphicsControlExtension.delayTime;
		imageBlock.disposalMethod = graphicsControlExtension.disposalMethod;
		imageBlock.transparentColorFlag = graphicsControlExtension.transparentColorFlag;
		imageBlock.transparentColorIndex = graphicsControlExtension.transparentColorIndex;
	} else {
		imageBlock.disposalMethod = DM_NO_ACTION;
		imageBlock.transparentColorFlag = false;
	}

	imageBlock.backgroundColorIndex = header.backgroundColorIndex;
	imageBlock.canvasWidth = header.canvasWidth;
	imageBlock.canvasHeight = header.canvasHeight;

	return imageBlock;
};

var prepareCanvas = function( imageBlock, imagesBlock ) {

	var imageDataLength = imageBlock.canvasWidth*imageBlock.canvasHeight*4;
	var imageData = imageBlock.imageData = new Uint8Array( imageDataLength );

	if( imageBlock.disposalMethod === DM_NO_ACTION ) {
		return true;
	}

	if( imagesBlock.length === 0 || imageBlock.disposalMethod === DM_RESTORE_BACKGROUND ) {
		var colorIndex = imageBlock.backgroundColorIndex*3;
		var r = imageBlock.palette[colorIndex];
		var g = imageBlock.palette[colorIndex+1];
		var b = imageBlock.palette[colorIndex+2]
		for( var i = 0; i < imageDataLength; ) {
			imageData[i++] = r;
			imageData[i++] = g;
			imageData[i++] = b;
			imageData[i++] = 255;
		}

	} else if( imageBlock.disposalMethod === DM_OVERDRAW_PICTURE || imageBlock.disposalMethod === DM_OVERDRAW_PICTURE_2 ) {
		var prevImageBlock	= imagesBlock[imagesBlock.length-1];
		var prevImageData = prevImageBlock.imageData;
		for( var i = 0; i < imageDataLength; i++ ) {
			imageData[i] = prevImageData[i];
		}

	} else {
		console.error( 'disposal method', imageBlock.disposalMethod, 'is unknown' );
		return false;
	}

	return true;
};

var decompressImageBlock = function( arrayBuffer, imageBlock ) {

	var imageData = imageBlock.imageData;
	var imageDataStartingIndex = imageBlock.top*imageBlock.canvasWidth*4 + imageBlock.left*4;
	var imageDataIndex = imageDataStartingIndex;

	var arrayBufferIndex = imageBlock.compressImageAddress;
	var LZWMinCodeSize = arrayBuffer[arrayBufferIndex++]; // at first is the LZWMinCodeSize value...
	if( LZWMinCodeSize < 2 || LZWMinCodeSize > 8 ) {
		console.error( 'LZWMinCodeSize:', LZWMinCodeSize, 'is erroneus' );
		return false;
	}

	var codeStream = new Uint8Array( imageBlock.width * imageBlock.height ); // make some room
	var codeStreamIndex = 0;

	var clearCode = 1 << LZWMinCodeSize;
	var endOfInformationCode = clearCode + 1;

	var codeTableIndex;
	var codeTable = [];

	var bitsThreshold = LZWMinCodeSize + 1;
	var curMaxCode = (1 << bitsThreshold) - 1;

	var bitShifter = 0;
	var bitsCount;

	var byteCount = arrayBuffer[arrayBufferIndex++]; // ...next is the byte count
	var nextBlockAddress = arrayBufferIndex + byteCount; // keep acumulating bytes

	var packedCode;
	var prevCode, code;
	var newCodeData;

	var incTable = new Uint8Array( [ 8,8,4,2,0 ] );
	var startTable = new Uint8Array( [ 0,4,2,1,0 ] );
	var pass = 0;
	var row = 0;

	var setCodeStream = function( colorIndexes ) {
		for( var i = 0; i < colorIndexes.length; i++ ) {
			codeStream[codeStreamIndex++] = colorIndexes[i];
		}
	};

	var getNextPackedCode = function() {
		if( byteCount === 0 ) {
			nextBlockAddress += 1 + (byteCount = arrayBuffer[arrayBufferIndex++]);
		}
		packedCode = arrayBuffer[arrayBufferIndex++];
		byteCount--;
	};

	var wasClearCode = false;
	var isFirstRun = true;
	
	for(;;) {

		bitShifter === 0 && getNextPackedCode(); // grab a byte from the code stream

		code = (packedCode >> bitShifter) & curMaxCode; // decode packed code
		bitsCount = 8 - bitShifter;
		if( bitsCount < bitsThreshold ) { // i need more bytes to calculate the code
			for( ; bitsCount < bitsThreshold; bitsCount += 8 ) {
				getNextPackedCode(); // grab next byte
				var diff = bitsThreshold - bitsCount;
				var mask = (1 << diff) - 1;
				code |= ((packedCode & mask) << bitsCount);
				bitShifter = diff & 7;
			}
		} else {
			bitShifter = (bitShifter + bitsThreshold) & 7;
		}

		if( code === endOfInformationCode ) {
			imageBlock.nextBlockAddress = nextBlockAddress + 1; // + 1 for block the terminator;
			break;
		}
		if( code > codeTableIndex ) {
			console.error( 'code:', code, 'is greater than code table size:', codeTableIndex );
			return false;
		}

		if( wasClearCode ) {
			// output {CODE} to index stream
			setCodeStream( codeTable[code] );
			wasClearCode = false;
			prevCode = code;
			continue;
		}

		if( code === clearCode ) {
			//DEBUG && console.log( codeTable );
			//DEBUG&&console.log( 'cleaning code table' );
			// reset table
			codeTableIndex = (1 << LZWMinCodeSize) + 2;
			for( var i = 0; i < codeTableIndex; i++ ) {
				codeTable[i] = [ i ];
			}
			// reset bits helpers
			bitsThreshold = LZWMinCodeSize + 1;
			curMaxCode = (1 << bitsThreshold) - 1;

			wasClearCode = true;
			isFirstRun = false;
			continue;
		}

		if( isFirstRun && !wasClearCode ) {
			// every gif compression data must start with a clear code
			console.error( 'bad gif file compression' );
			return false;
		}

		// is CODE in the code table?
		if( code < codeTableIndex ) {
			// output {CODE} to index stream
			setCodeStream( codeTable[code] );
			// let K be the first index in {CODE}
			k = codeTable[code][0];
			// add {CODE-1}+K to the code table
			newCodeData = codeTable[prevCode];
			newCodeData = newCodeData.slice( 0, newCodeData.length );
			newCodeData.push( k );
			codeTable[codeTableIndex] = newCodeData;
		} else {
			// let K be the first index of {CODE-1}
			k = codeTable[prevCode][0];
			// add {CODE-1}+K to code table
			newCodeData = codeTable[prevCode];
			newCodeData = newCodeData.slice( 0, newCodeData.length );
			newCodeData.push( k );
			codeTable[codeTableIndex] = newCodeData;
			// output {CODE-1}+K to index stream
			setCodeStream( newCodeData );
		}

		if( codeTableIndex === curMaxCode && bitsThreshold !== 12 ) {
			curMaxCode = (1 << ++bitsThreshold) - 1;
			//DEBUG&&console.log( 'incrementing bitsThreshold to', bitsThreshold );
		}
		codeTableIndex++;

		prevCode = code;
	}

	for( var y = 0, i = 0; y < imageBlock.height; y++ ) {
		for( var x = 0; x < imageBlock.width; x++ ) {
			var colorIndex = codeStream[i++];
			if( imageBlock.transparentColorFlag && colorIndex === imageBlock.transparentColorIndex ) {
				imageDataIndex += 4;
				continue;
			}
			colorIndex *= 3;
			imageData[imageDataIndex++] = imageBlock.palette[colorIndex];
			imageData[imageDataIndex++] = imageBlock.palette[colorIndex+1];
			imageData[imageDataIndex++] = imageBlock.palette[colorIndex+2];
			imageData[imageDataIndex++] = 255;
		}

		if( imageBlock.isInterlaced ) {
			row += incTable[pass];
			if( row >= imageBlock.height ) {
				row = startTable[++pass];
			}
			imageDataIndex = (imageDataStartingIndex = (imageBlock.top + row)*imageBlock.canvasWidth*4 + imageBlock.left*4);
		} else {
			imageDataIndex = (imageDataStartingIndex += imageBlock.canvasWidth*4);
		}
	}
	
	//DEBUG && console.log( codeTable );
	//DEBUG && console.log( arrayBuffer.subarray( imageBlock.compressImageAddress, imageBlock.nextBlockAddress ) );

	return true;
};

var isEOF = function( arrayBuffer, start ) {
	return bytes2String( arrayBuffer, start, 1 ) === ';'; // 59 === ';'
};

var processFile = function( arrayBuffer, imagesBlock ) {
	var header = {};
	if( !getHeader( arrayBuffer, header ) ) {
		return;
	}
	DEBUG&&console.log( 'header', header );

	var graphicsControlExtension = null;
	var applicationExtension = null;
	var plainTextExtension = null;
	var commentExtension = null;
	var blockData;
	for( var nextBlockAddress = header.nextBlockAddress; !isEOF( arrayBuffer, nextBlockAddress ); nextBlockAddress = blockData.nextBlockAddress ) {
		if( (blockData = processExtensionBlock( arrayBuffer, nextBlockAddress )) ) {
			switch( blockData.type ) {
				case GRAPHICS_CONTROL_EXTENSION: {
					graphicsControlExtension = blockData;
					DEBUG&&console.log( 'graphics control extension', blockData );
					break;
				}
				case APPLICATION_EXTENSION: {
					applicationExtension = blockData;
					DEBUG&&console.log( 'application extension', blockData );
					break;
				}
				case PLAIN_TEXT_EXTENSION: {
					plainTextExtension = blockData;
					DEBUG&&console.log( 'plain text extension', blockData );
					break;
				}
				case COMMENT_EXTENSION: {
					commentExtension = blockData;
					DEBUG&&console.log( 'comment extension', blockData );
					break;
				}
				case UNKNOWN_EXTENSION:
				default: {
					return false;
				}
			}
		} else if( (blockData = getImageBlock( arrayBuffer, nextBlockAddress, header, graphicsControlExtension )) ) {
			DEBUG&&console.log( 'image block', imagesBlock.length, blockData );
			if( !prepareCanvas( blockData, imagesBlock ) ) {
				return false;
			}
			if( !decompressImageBlock( arrayBuffer, blockData ) ) {
				return false;
			}
			imagesBlock.push( blockData );
		} else {
			console.error( 'something wrong has ocurred with the gif file decompression' );
			return false;
		}
	}
	//DEBUG&&console.log( imagesBlock, imagesBlock.length );
	return true;
};

/**
* MAIN
*/
DEBUG = true;

self.addEventListener( 'message', function( e ) {
	if( e.data.type === 'filepath' ) {
		openFile( e.data.data, startDecoding );
	} else { // type === 'arrayBuffer'
		startDecoding( e.data.data );
	}
} );

var startDecoding = function( arrayBuffer ) {
	if( !arrayBuffer ) {
		self.postMessage( null );
		return;
	}
	//console.log( arrayBuffer );
	console.log( 'file size is', arrayBuffer.length, 'bytes long' );
	
	var imagesBlock = [];
	if( !processFile( arrayBuffer, imagesBlock ) ) {
		console.error( 'something went wrong!');
		self.postMessage( null );
	} else {
		self.postMessage( imagesBlock );
	}
};
