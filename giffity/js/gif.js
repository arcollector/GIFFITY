/**
* GIF
*/
var GIF = {
	init: function( options ) {
		this._$canvas = null;
		this._ctx = null;
		if( options.canvasSelector ) {
			this._$canvas = document.querySelector( options.canvasSelector );
			if( !this._$canvas ) {
				console.error( 'missing elem <canvas> with selector', options.canvasSelector );
				return;
			}
			this._ctx = this._$canvas.getContext( '2d' );
		}

		var path = options.libPath || '';
		path += this._checkPathCorrectness( path );

		this._decoder = new Worker( path + 'gif.decoder.js');
		this._decoder.addEventListener( 'message', this._decoded.bind( this ) );

		this._encoder = new Worker( path + 'gif.encoder.js');
		this._encoder.addEventListener( 'message', this._encoded.bind( this ) );

		this._ditherer = new Worker( path + 'gif.dither.js');
		this._ditherer.addEventListener( 'message', this._dithered.bind( this ) );

		this._callback = null;

		this._imagesPath = options.imagesPath || '';
		this._imagesPath += this._checkPathCorrectness( this._imagesPath );
	},

	decode: function( filenameURL, callback ) {
		if( typeof callback !== 'function' ) {
			console.error( 'missing callback param' );
			return;
		}
		this._callback = callback;
		this._decoder.postMessage( { type: 'filepath', data: this._imagesPath + filenameURL } );
	},
	_decoded: function( e ) {
		this._callCallback( e.data );
	},
	
	setupAnimation: function( imagesBlock ) {
		this._lastImagesBlock = imagesBlock;
		this._curImageBlock = 0;
		this._stopAnimation = false;
	},
	stop: function() {
		this._stopAnimation = true;
		this._curImageBlock = 0;
		this.displayOnCanvas( this._lastImagesBlock[0], this._$canvas );
	},
	pause: function() {
		this._stopAnimation = true;
	},
	play: function() {
		if( this._stopAnimation ) {
			this._stopAnimation = false;
			return;
		}
		var imageBlock = this._lastImagesBlock[this._curImageBlock];
		this.displayOnCanvas( imageBlock, this._$canvas );
		if( this._lastImagesBlock.length > 1 ) {
			setTimeout( function() {
				this._curImageBlock = (this._curImageBlock + 1) % this._lastImagesBlock.length;
				GIF.play();
			}.bind( GIF ), imageBlock.delayTime/100*1000 );
		}
	},
	displayOnCanvas: function( imageBlock, $canvasElem ) {
		var ctx = $canvasElem.getContext( '2d' );
		var w = $canvasElem.width = imageBlock.canvasWidth;
		var h = $canvasElem.height = imageBlock.canvasHeight;
		var image = ctx.createImageData( w, h );
		image.data.set( imageBlock.imageData );
		ctx.putImageData( image, 0, 0 );
	},
	
	encode: function( options, callback ) {
		if( typeof callback !== 'function' ) {
			console.error( 'missing callback param' );
			return;
		}
		this._callback = callback;
		this._encoder.postMessage( { options: options } );
	},
	_encoded: function( e ) {
		this._callCallback( e.data );
	},

	download: function( arrayBuffer, filename ) {
		filename = filename ? filename + '' : +new Date() + '';
		var $a = document.createElement( 'a' );
		$a.setAttribute( 'download', filename + '.gif' );
		var objectURL = URL.createObjectURL( new Blob( [ arrayBuffer ], { type: 'application/octet-binary' } ) );
		$a.setAttribute( 'href', objectURL );
		$a.style.display = 'none';
		document.body.appendChild( $a );
		$a.click();
		document.body.removeChild( $a );
		//URL.revokeObjectURL( objectURL ); // in firefox this does not work
	},

	loadImageFromURL: function( filenameURL, callback ) {
		if( typeof callback !== 'function' ) {
			console.error( 'missing callback param' );
			return false;
		}
		this._callback = callback;
		var $img = new Image();
		$img.src = this._imagesPath + filenameURL;
		$img.onload = this._imageLoadedOk.bind( this );
		$img.onerror = this._imageLoadedFail.bind( this );
		return true;
	},
	_imagesType: {
		'image/bmp': 1,
		'image/png': 1,
		'image/gif': 1,
		'image/jpeg': 1,
	},
	loadImageFromFile: function( file, callback ) {
		if( typeof callback !== 'function' ) {
			console.error( 'missing callback param' );
			return false;
		}
		if( !(file.type in this._imagesType) ) {
			console.error( 'file is not an image' );
			return false;
		}
		this._callback = callback;
		this._fileType = file.type;
		var reader = new FileReader();
		reader.onload = this._imageLoadedFromFileOk.bind( this );
		reader.onerror = this._imageLoadedFail.bind( this );
		reader.readAsArrayBuffer( file );
		return true;
	},
	_imageLoadedFromFileOk: function( e ) {
		var arrayBuffer = new Uint8Array( e.target.result );
		if( this._fileType === 'image/gif' ) { // use own decoder
			this._decoder.postMessage( { type: 'arrayBuffer', data: arrayBuffer } );
		} else { // use <img> browser native decoder
			var $img = new Image();
			$img.src = URL.createObjectURL( new Blob( [ arrayBuffer ], { type: this._fileType } ) );
			$img.onload = this._imageLoadedOk.bind( this );
			$img.onerror = this._imageLoadedFail.bind( this );
		}
		this._fileType = null;
	},
	_imageLoadedOk: function( e ) {
		// get the image.data by using <canvas> getImageData native function
		var $img = e.target;
		var $canvas = document.createElement( 'canvas' );
		var width = $canvas.width = $img.width;
		var height = $canvas.height = $img.height;
		var ctx = $canvas.getContext( '2d' );
		ctx.drawImage( $img, 0, 0 );
		var image = ctx.getImageData( 0, 0, width, height );
		var imageData = image.data;
		this._callCallback( {
			canvasWidth: width,
			canvasHeight: height,
			imageData: imageData,
		} );
	},
	_imageLoadedFail: function( e ) {
		this._callCallback( null );
	},

	dither: function( imageBlock, type, callback ) {
		if( typeof callback !== 'function' ) {
			console.error( 'missing callback param' );
			return;
		}
		this._callback = callback;
		this._ditherer.postMessage( {
			imageBlock: imageBlock,
			type: type
		} );
	},
	_dithered: function( e ) {
		this._callCallback( e.data );
	},

	_callCallback: function( data ) {
		var callback = this._callback;
		this._callback = null;
		callback( data );
	},
	_checkPathCorrectness: function( path ) {
		return path.length && path.substring( path.length-1 ) !== '/' ? '/' : '';
	},
};

GIF.DitherType = {
	MONOCHROME: 0x01,
	MONOCHROME_BAYER: 0x02,
	MONOCHROME_FLOYD: 0x03,
	MONOCHROME_STUCKI: 0x04,
	MONOCHROME_BURKES: 0x05,
	MONOCHROME_SIERRA: 0x06,
	MONOCHROME_JARVIS_JUDICE_NINKE: 0x07,
	MONOCHROME_STEVENSON_ARCE: 0x08,

	GRAY_SCALE: 0x10,

	_256_COLORS: 0x0100,
	_256_COLORS_FLOYD: 0x0200,
	_256_COLORS_STUCKI: 0x0300,
	_256_COLORS_BURKES: 0x0400,
	_256_COLORS_SIERRA: 0x0500,
	_256_COLORS_JARVIS_JUDICE_NINKE: 0x0600,
	_256_COLORS_STEVENSON_ARCE: 0x0700,

};
