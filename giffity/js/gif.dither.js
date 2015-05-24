/**
* UTILS
*/

var recalcPalette = function( imageBlock ) {
	var imageData = imageBlock.imageData;
	var colorCount = 1 << imageBlock.colorBits;
	var paletteLength = colorCount*3;
	var newPalette = new Uint8Array( paletteLength );
	var newPaletteIndex = 0;
	var colorsDict = {};
	for( var i = 0, l = imageData.length; i < l; ) {
		var r = imageData[i++];
		var g = imageData[i++];
		var b = imageData[i++];
		i++;
		var colorDictIndex = r + ',' + g + ',' + b;
		if( !(colorDictIndex in colorsDict) ) {
			if( newPaletteIndex === paletteLength ) {
				console.error( 'target image has more than', colorCount, 'posible colors' );
				return false;
			}
			newPalette[newPaletteIndex++] = r;
			newPalette[newPaletteIndex++] = g;
			newPalette[newPaletteIndex++] = b;
			colorsDict[colorDictIndex] = true;
		}
	}
	imageBlock.palette = newPalette;
	return true;
};

/**
* DITHERING
*/

var initDither = function( instance, imageBlock, colorRange, ditherData ) {
	instance.imageBlock = imageBlock;
	instance.imageData = imageBlock.imageData;
	instance.imageDataLengh = imageBlock.imageData.length;
	instance.width = imageBlock.canvasWidth;
	instance.height = imageBlock.canvasHeight;
	if( colorRange ) {
		instance.black = colorRange[0];
		instance.white = colorRange[1];
		instance.grayMidpoint = ( instance.white + instance.black ) / 2;
	}
	instance.ditheredImageData = new Uint8Array( instance.width * instance.height * 4 );
	if( ditherData ) {
		instance.hasFilter = true;
		instance.ditherTable = ditherData.table;
		instance.ditherTableRows = ditherData.rows;
		instance.ditherTableCols = ditherData.cols;
		instance.ditherTablePivot = parseInt( ditherData.cols / 2 );
		instance.ditherTableTotal = 0;
		for( var i = 0, l = ditherData.rows*ditherData.cols; i < l; i++ ) {
			instance.ditherTableTotal += ditherData.table[i];
		}
	} else {
		instance.hasFilter = false;
	}
};

var DitherMonochrome = function( imageBlock, colorRange, ditherData ) {
	initDither( this, imageBlock, colorRange, ditherData );
};
DitherMonochrome.prototype = {

	getPixel: function( x, y ) {
		var imageDataIndex = (y*this.width*4 + x*4) % (this.imageDataLengh);
		return this.imageData[imageDataIndex];
	},

	setPixel: function( x, y, color ) {
		if( x > this.width || y > this.height || x < 0 || y < 0 ) {
			return;
		}
		if( color > this.white ) {
			color = this.white;
		}
		if( color < this.black ) {
			color = this.black;
		}
		color = parseInt( color );
		var imageDataIndex = y*this.width*4 + x*4;
		this.imageData[imageDataIndex] = color;
		this.imageData[imageDataIndex+1] = color;
		this.imageData[imageDataIndex+2] = color;
	},

	setDiffusionError: function( x, y, error ) {
		for( var row = 0; row < this.ditherTableRows; row++ ) {
			for( var col = 0; col < this.ditherTableCols; col++ ) {
				var val = this.ditherTable[row*this.ditherTableCols + col];
				if( !val ) {
					continue;
				}
				var x1 = x + (col - this.ditherTablePivot);
				var y1 = y + row;
				if( x1 < 0 || x1 > this.width || y1 > this.height ) {
					continue;
				}
				var pixelDithered = this.getPixel( x1, y1 ) + (error*val)/this.ditherTableTotal;
				this.setPixel( x1, y1, pixelDithered );
			}
		}
	},

	dither: function() {
		var i = 0;
		for( var y = 0; y < this.height; y++ ) {
			for( var x = 0; x < this.width; x++ ) {
				var gray = this.imageData[i];
				var error;
				var whiteOrBlack;
				if( gray > this.grayMidpoint ) {
					whiteOrBlack = 255;
					error = gray - this.white;
				} else {
					whiteOrBlack = 0;
					error = gray - this.black;
				}
				this.ditheredImageData[i++] = whiteOrBlack;
				this.ditheredImageData[i++] = whiteOrBlack;
				this.ditheredImageData[i++] = whiteOrBlack;
				this.ditheredImageData[i++] = 255;
				this.hasFilter && this.setDiffusionError( x, y, error );
			}
		}
		this.imageBlock.imageData = this.ditheredImageData;
		this.imageBlock.colorBits = 1;
		return recalcPalette( this.imageBlock );
	},
};

// *******************************************************
// *******************************************************

var DitherColor = function( imageBlock, ditherData ) {
	initDither( this, imageBlock, null, ditherData );
};
DitherColor.prototype = {

	getPixel: function( x, y ) {
		var imageDataIndex = (y*this.width*4 + x*4) % this.imageDataLengh;
		return new Uint8Array( [
			this.imageData[imageDataIndex],
			this.imageData[imageDataIndex+1],
			this.imageData[imageDataIndex+2],
		] );
	},

	setPixel: function( x, y, rgb ) {
		if( x > this.width || y > this.height || x < 0 || y < 0 ) {
			return;
		}
		var imageDataIndex = y*this.width*4 + x*4;
		this.imageData[imageDataIndex] = rgb[0];
		this.imageData[imageDataIndex+1] = rgb[1];
		this.imageData[imageDataIndex+2] = rgb[2];
	},

	setDiffusionError: function( x, y, r, g, b, mr, mg, mb ) {
		var dr = r - mr;
		var dg = g - mg;
		var db = b - mb;
		for( var row = 0; row < this.ditherTableRows; row++ ) {
			for( var col = 0; col < this.ditherTableCols; col++ ) {
				var val = this.ditherTable[row*this.ditherTableCols + col];
				if( !val ) {
					continue;
				}
				var x1 = x + (col - this.ditherTablePivot);
				var y1 = y + row;
				if( x1 < 0 || x1 > this.width || y1 > this.height ) {
					continue;
				}
				var rgb = this.getPixel( x1, y1 );
				var factor = val/this.ditherTableTotal;
				this.setPixel( x1, y1, new Uint8Array( [
					Math.max( 0, Math.min( 255, rgb[0] + parseInt( dr*factor ) ) ),
					Math.max( 0, Math.min( 255, rgb[1] + parseInt( dg*factor ) ) ),
					Math.max( 0, Math.min( 255, rgb[2] + parseInt( db*factor ) ) ),
				] ) );
			}
		}
	},

	dither8Colors: function() {
		var min = new Uint8Array( [ 255, 255, 255 ] );
		var max = new Uint8Array( [ 0, 0, 0 ] );

		for( var i = 0; i < this.imageDataLengh; ) {
			var r = this.imageData[i++];
			var g = this.imageData[i++];
			var b = this.imageData[i++];
			i++;
			min[0] = Math.min( min[0], r );
			min[1] = Math.min( min[1], g );
			min[2] = Math.min( min[2], b );
			max[0] = Math.max( max[0], r );
			max[1] = Math.max( max[1], g );
			max[2] = Math.max( max[2], b );
		}

		var mid = new Uint8Array( [
			parseInt( (max[0] + min[0]) / 2 ),
			parseInt( (max[1] + min[1]) / 2 ),
			parseInt( (max[2] + min[2]) / 2 ),
		] );

		var i = 0;
		for( var y = 0; y < this.height; y++ ) {
			for( var x = 0; x < this.width; x++ ) {
				var r = this.imageData[i];
				var g = this.imageData[i+1];
				var b = this.imageData[i+2];
				var mr = r > mid[0] ? 255 : 0;
				var mg = g > mid[1] ? 255 : 0;
				var mb = b > mid[2] ? 255 : 0;
				this.ditheredImageData[i++] = mr;
				this.ditheredImageData[i++] = mg;
				this.ditheredImageData[i++] = mb;
				this.ditheredImageData[i++] = 255;
				this.hasFilter && this.setDiffusionError( x, y, r, g, b, mr, mg, mb );
			}
		}
		this.imageBlock.imageData = this.ditheredImageData;
		this.imageBlock.colorBits = 3;
		return recalcPalette( this.imageBlock );
	},

	dither: function( palette, paletteLength ) {
		// make the reemplacements in the image based on this new palette
		var i = 0;
		for( var y = 0; y < this.height; y++ ) {
			for( var x = 0; x < this.width; x++ ) {
				var r = this.imageData[i];
				var g = this.imageData[i+1];
				var b = this.imageData[i+2];
				// search the reemplacement color
				var curMinDist = Number.POSITIVE_INFINITY;
				var indexPalette = -1;
				for( var j = 0; j < paletteLength; j += 3 ) {
					var rPalette = palette[j];
					var gPalette = palette[j+1];
					var bPalette = palette[j+2];
					var dist = 3*Math.pow(rPalette - r, 2) + 4*Math.pow(gPalette - g, 2) + 2*Math.pow(bPalette - b, 2);
					if( dist < curMinDist ) {
						curMinDist = dist;
						indexPalette = j;
						if( curMinDist === 0 ) { // colors are the same
							break;
						}
					}
				}
				if( indexPalette === -1 ) {
					return false;
				}
				var mr = palette[indexPalette];
				var mg = palette[indexPalette+1];
				var mb = palette[indexPalette+2];
				this.ditheredImageData[i++] = mr;
				this.ditheredImageData[i++] = mg;
				this.ditheredImageData[i++] = mb;
				this.ditheredImageData[i++] = 255;
				this.hasFilter && this.setDiffusionError( x, y, r, g, b, mr, mg, mb );
			}
		}
		this.imageBlock.imageData = this.ditheredImageData;
		this.imageBlock.colorBits = 8;
		this.imageBlock.palette = palette;
		return true;
	},
};

// *******************************************************
// *******************************************************

/**
* GRAY SCALE TRANSFORMATION
*/

var toGrayScale = function( imageBlock, notRecalcPalette ) {
	var imageData = imageBlock.imageData;
	var width = imageBlock.canvasWidth;
	var height = imageBlock.canvasHeight;
	var i = 0;
	var black = 255;
	var white = 0;
	for( var y = 0; y < height; y++ ) {
		for( var x = 0; x < width; x++ ) {
			var red = imageData[i];
			var green = imageData[i+1];
			var blue = imageData[i+2];
			var gray = red*.30 + green*.59 + blue*.11;
			black = Math.min( black, gray );
			white = Math.max( white, gray );
			gray = parseInt( gray );
			imageData[i++] = gray;
			imageData[i++] = gray;
			imageData[i++] = gray;
			i++;
		}
	}
	imageBlock.colorBits = 8;
	if( !notRecalcPalette && !recalcPalette( imageBlock ) ) {
		return null;
	}
	return new Uint8Array( [ black, white ] );
};

// *******************************************************
// *******************************************************

/**
* MONOCHROME TRANSFORMATION
*/

var toMonochrome = function( imageBlock, colorRange, filter ) {
	return new DitherMonochrome( imageBlock, colorRange, filter ).dither();
};

// *******************************************************
// *******************************************************

var BayerTable = new Uint8Array( [
	0, 32, 8, 40, 2, 34, 10, 42 ,
	48, 16, 56, 24, 50, 18, 58, 26 ,
	12, 44, 4, 36, 14, 46, 6, 38 ,
	60, 28, 52, 20, 62, 30, 54, 22 ,
	3, 35, 11, 43, 1, 33, 9, 41 ,
	51, 19, 59, 27, 49, 17, 57, 25 ,
	15, 47, 7, 39, 13, 45, 5, 37 ,
	63, 31, 55, 23, 61, 29, 53, 21 ,
] );

var toMonochromeBayer = function( imageBlock ) {
	var width = imageBlock.canvasWidth;
	var height = imageBlock.canvasHeight;
	var imageData = imageBlock.imageData;
	var i = 0;
	for( var y = 0; y < height; y++ ) {
		for( var x = 0; x < width; x++ ) {
			var gray = imageData[i];
			var whiteOrBlack = (gray/4) > BayerTable[(y&7)*8+(x&7)] ? 255 : 0;
			imageData[i++] = whiteOrBlack;
			imageData[i++] = whiteOrBlack;
			imageData[i++] = whiteOrBlack;
			i++;
		}
	}
	imageBlock.colorBits = 1;
	return recalcPalette( imageBlock );
};

// FLOYD DITHER
// 	0 X 7
// 	3 5 1
//
var FloydTable = {
	table: new Uint8Array( [
		0, 0, 7,
		3, 5, 1
	] ),
	rows: 2,
	cols: 3
};

// STUCKI DITHER
// 	0 0 X 8 4
// 	2 4 8 4 2
//	1 2 4 2 1
//
var StuckiTable = {
	table: new Uint8Array( [
		0, 0, 0, 8, 4,
		2, 4, 8, 4, 2,
		1, 2, 4, 2, 1,
	] ),
	rows: 3,
	cols: 5
};

// BURKES DITHER
// 	0 0 X 8 4
// 	2 4 8 4 2
//
var BurkesTable = {
	table: new Uint8Array( [
		0, 0, 0, 8, 4,
		2, 4, 8, 4, 2,
	] ),
	rows: 2,
	cols: 5
};

// SIERRA DITHER
// 	0 0 X 5 3
// 	2 4 5 4 2
// 	0 2 3 2 0
//
var SierraTable = {
	table: new Uint8Array( [
		0, 0, 0, 5, 3,
		2, 4, 5, 4, 2,
		0, 2, 3, 2, 0,
	] ),
	rows: 3,
	cols: 5
};

// Jarvis, Judice & Ninke DITHER
// 	0 0 X 7 5
// 	3 5 7 5 3
// 	1 3 5 3 1
//
var JarvisJudiceNinkeTable = {
	table: new Uint8Array( [
		0, 0, 0, 7, 5,
		3, 5, 7, 5, 3,
		1, 3, 5, 3, 1,
	] ),
	rows: 3,
	cols: 5
};

// Stevenson & Arce DITHER
// 	0   0   0  X  0  32   0
// 	12  0  26  0  30  0  16
//	0   12  0 26  0  12   0
//   5   0  12  0  12  0   5
//
var StevensonArceTable = {
	table: new Uint8Array( [
		0, 0, 0, 0, 0, 32, 0,
		12, 0, 26, 0, 30, 0, 16,
		0, 12, 0, 26, 0, 12, 0,
		5, 0, 12, 0, 12, 0, 5,
	] ),
	rows: 4,
	cols: 7
};

// *******************************************************
// *******************************************************

const BITS_PER_PRIM_COLOR = 4;
const HISTOGRAM_LENGTH = 1 << (BITS_PER_PRIM_COLOR * 3);
const MAX_PRIM_COLOR = (1 << BITS_PER_PRIM_COLOR) - 1;
const COLOR_SCALING = Math.pow(2, BITS_PER_PRIM_COLOR);
const COLOR_SCALING_INVERSE = 1 / COLOR_SCALING;
const PALETTE_LENGTH = 256;

var to256Colors = function( imageBlock, filter ) {

	var imageData = imageBlock.imageData;
	var imageDataLengh = imageData.length;
	var canvasWidth = imageBlock.canvasWidth;
	var canvasHeight = imageBlock.canvasHeight;

	// init histogram
	var histogram = [];
	for( var i = 0; i < HISTOGRAM_LENGTH; i++ ) {
		histogram[i] = {
			rgb: new Uint8Array( [
				i >> (2*BITS_PER_PRIM_COLOR),
				(i >> BITS_PER_PRIM_COLOR) & MAX_PRIM_COLOR,
				i & MAX_PRIM_COLOR
			] ),
			count: 0,
		};
	}
	// fill up histogram
	var minR, minG, minB;
	var maxR, maxG, maxB;
	minR = minG = minB = MAX_PRIM_COLOR;
	maxR = maxG = maxB = 0;
	for( var i = 0; i < imageDataLengh; ) {
		// reduce color range (0-255) to (0-MAX_PRIM_COLOR)
		var r = parseInt( imageData[i++] * COLOR_SCALING_INVERSE );
		var g = parseInt( imageData[i++] * COLOR_SCALING_INVERSE );
		var b = parseInt( imageData[i++] * COLOR_SCALING_INVERSE );
		minR = Math.min( minR, r );
		minG = Math.min( minG, g );
		minB = Math.min( minB, b );
		maxR = Math.max( maxR, r );
		maxG = Math.max( maxG, g );
		maxB = Math.max( maxB, b );
		i++;
		var index = (r << (2*BITS_PER_PRIM_COLOR)) + (g << BITS_PER_PRIM_COLOR) + b;
		histogram[index].count++;
	}

	// init cubes rgb
	var rgbCubes = [];
	for( var i = 0; i < PALETTE_LENGTH; i++ ) {
		rgbCubes[i] = {
			colors: [], // store here the histogram entries
			count: 0, // total pixels
			numEntries: 0, // total differents colors
			rgbMin: new Uint8Array( [ minR,minG,minB ] ),
			rgbAxisLength: new Uint8Array( [ maxR,maxG,maxB ] ),
		};
	}
	// populate the first rgb cube with the histogram data
	var i = 0;
	for( ; i < HISTOGRAM_LENGTH; i++ ) { // look for the first entry with count > 0
		if( histogram[i].count > 0 ) {
			break;
		}
	}
	var colors = rgbCubes[0].colors;
	colors.push( histogram[i] );
	var numEntries = 1;
	while( ++i < HISTOGRAM_LENGTH ) {
		if( histogram[i].count > 0 ) {
			colors.push( histogram[i] );
			numEntries++;
		}
	}
	rgbCubes[0].numEntries = numEntries; // different sampled colors
	rgbCubes[0].count = canvasWidth * canvasHeight; // pixels

	// sort funct
	var sortRGBAxis = 0;
	var sortRGBAxisFunct = function( a, b ) {
		return a.rgb[sortRGBAxis] - b.rgb[sortRGBAxis];
	};

	var curPaletteLength = 1;
	while( PALETTE_LENGTH > curPaletteLength ) {

		// search the rgb with the largest axis length
		var maxAxisLength = -1;
		var index = 0;
		for( var i = 0; i < curPaletteLength; i++ ) {
			for( var j = 0; j < 3; j++ ) {
				if( rgbCubes[i].rgbAxisLength[j] > maxAxisLength && rgbCubes[i].numEntries > 1 ) {
					maxAxisLength = rgbCubes[i].rgbAxisLength[j]
					index = i;
					sortRGBAxis = j;
				}
			}
		}
		if( maxAxisLength === -1 ) {
			break;
		}

		// sort rgbCubes[index].colors by sortRGBAxis
		var splitCube = rgbCubes[index];
		var colors = splitCube.colors;
		colors.sort( sortRGBAxisFunct );

		// split rgbCubes[index]
		// setup the first half
		var count = colors[0].count;
		var sum = parseInt( splitCube.count / 2 ) - count;
		var numEntries = 1;
		var i = 1;
		while( (sum -= colors[i].count) >= 0 ) {
			numEntries++;
			count += colors[i].count;
			i++;
		}
		i--;

		var maxColor = colors[i].rgb[sortRGBAxis]; // max of the first half
		var minColor = colors[i+1].rgb[sortRGBAxis]; // min of the second half

		var cubeA = rgbCubes[index];
		var cubeB = rgbCubes[curPaletteLength];

		// create the new split
		cubeB.colors = colors.slice( i+1, colors.length );
		cubeB.count = cubeA.count - count;
		cubeB.numEntries = cubeA.numEntries - numEntries;

		// use the cubeA as the other half
		cubeA.colors = colors.slice( 0, i+1 );
		cubeA.count = count;
		cubeA.numEntries = numEntries;

		for( var i = 0; i < 3; i++ ) {
		    cubeB.rgbMin[i] = cubeA.rgbMin[i];
		    cubeB.rgbAxisLength[i] = cubeA.rgbAxisLength[i];
		}
		cubeB.rgbAxisLength[sortRGBAxis] = cubeB.rgbMin[sortRGBAxis] + cubeB.rgbAxisLength[sortRGBAxis] - minColor;
		cubeB.rgbMin[sortRGBAxis] = minColor;

		cubeA.rgbAxisLength[sortRGBAxis] = maxColor - cubeA.rgbMin[sortRGBAxis];

		curPaletteLength++;
	}

	// make the final palette
	var palette = new Uint8Array( PALETTE_LENGTH * 3 );
	var paletteIndex = 0;
	for( var i = 0; i < curPaletteLength; i++ ) {
		var numEntries = rgbCubes[i].numEntries;
		if( numEntries === 0 ) {
			continue;
		}
		var factor = COLOR_SCALING / numEntries;
		var colors = rgbCubes[i].colors;
		var rgbAvg = new Uint8Array( [ 0,0,0 ] );
		for( var j = 0, l = colors.length; j < l; j++ ) {
			var rgb = colors[j].rgb;
			rgbAvg[0] += rgb[0];
			rgbAvg[1] += rgb[1];
			rgbAvg[2] += rgb[2];
		}
		palette[paletteIndex++] = parseInt( Math.max( 0, Math.min( 255, rgbAvg[0]*factor ) ) );
		palette[paletteIndex++] = parseInt( Math.max( 0, Math.min( 255, rgbAvg[1]*factor ) ) );
		palette[paletteIndex++] = parseInt( Math.max( 0, Math.min( 255, rgbAvg[2]*factor ) ) );
	}
	// NOTE: paletteIndex may be not equal to 256*3

	return new DitherColor( imageBlock, filter ).dither( palette, paletteIndex );
};

// *******************************************************
// *******************************************************

const MONOCHROME = 0x01;
const MONOCHROME_BAYER = 0x02;
const MONOCHROME_FLOYD = 0x03;
const MONOCHROME_STUCKI = 0x04;
const MONOCHROME_BURKES = 0x05;
const MONOCHROME_SIERRA = 0x06;
const MONOCHROME_JARVIS_JUDICE_NINKE = 0x07;
const MONOCHROME_STEVENSON_ARCE = 0x08;

const GRAY_SCALE = 0x10;

const _256_COLORS = 0x0100;
const _256_COLORS_FLOYD = 0x0200;
const _256_COLORS_STUCKI = 0x0300;
const _256_COLORS_BURKES = 0x0400;
const _256_COLORS_SIERRA = 0x0500;
const _256_COLORS_JARVIS_JUDICE_NINKE = 0x0600;
const _256_COLORS_STEVENSON_ARCE = 0x0700;

var filterTables = {};
filterTables[MONOCHROME] = null;
filterTables[MONOCHROME_FLOYD] = FloydTable;
filterTables[MONOCHROME_STUCKI] = StuckiTable;
filterTables[MONOCHROME_BURKES] = BurkesTable;
filterTables[MONOCHROME_SIERRA] = SierraTable;
filterTables[MONOCHROME_JARVIS_JUDICE_NINKE] = JarvisJudiceNinkeTable;
filterTables[MONOCHROME_STEVENSON_ARCE] = StevensonArceTable;

filterTables[_256_COLORS] = null;
filterTables[_256_COLORS_FLOYD] = FloydTable;
filterTables[_256_COLORS_STUCKI] = StuckiTable;
filterTables[_256_COLORS_BURKES] = BurkesTable;
filterTables[_256_COLORS_SIERRA] = SierraTable;
filterTables[_256_COLORS_JARVIS_JUDICE_NINKE] = JarvisJudiceNinkeTable;
filterTables[_256_COLORS_STEVENSON_ARCE] = StevensonArceTable;

// *******************************************************
// *******************************************************

/**
* MAIN
*/

var DEBUG = true;

self.addEventListener( 'message', function( e ) {
    var args = e.data;
	var imageBlock = args.imageBlock;
	var ret;
    switch( args.type ) {
		case MONOCHROME:
		case MONOCHROME_FLOYD:
		case MONOCHROME_STUCKI:
		case MONOCHROME_BURKES:
		case MONOCHROME_SIERRA:
		case MONOCHROME_JARVIS_JUDICE_NINKE:
		case MONOCHROME_STEVENSON_ARCE: {
			var colorRange = toGrayScale( imageBlock, true );
			ret = toMonochrome( imageBlock, colorRange, filterTables[args.type] );
			break;
		}
		case MONOCHROME_BAYER: {
			toGrayScale( imageBlock, true );
			ret = toMonochromeBayer( imageBlock );
            break;
        }

		case GRAY_SCALE: {
			var colorRange = toGrayScale( imageBlock, false );
			ret = !colorRange ? false : true;
			break;
		}

		case _256_COLORS:
		case _256_COLORS_FLOYD:
		case _256_COLORS_STUCKI:
		case _256_COLORS_BURKES:
		case _256_COLORS_SIERRA:
		case _256_COLORS_JARVIS_JUDICE_NINKE:
		case _256_COLORS_STEVENSON_ARCE: {
			ret = to256Colors( imageBlock, filterTables[args.type] );
			break;
		}

        default: {
			ret = false;
            break;
        }
    }
	self.postMessage( !ret ? null : imageBlock );
} );
