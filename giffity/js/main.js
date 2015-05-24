var App = {};
App.Helpers = {};

// *********************

App.init = function() {
	if( window.require ) {
		App.gui = require( 'nw.gui' );
		App.win = App.gui.Window.get();
	} else {
		App.gui = null;
		App.win = window;
	}
	
	App.$imageWrapper = document.querySelector( '.g-image-wrapper' );
	App.$imageViewer = document.querySelector( '.g-image-viewer' );
	App.$imageCanvas = document.querySelector( '.g-image-canvas' );
	App.$imageLoader = document.querySelector( '.g-image-loader' );
	App.$imageLoaderError = document.querySelector( '.g-image-loader-error' );
	
	App.$footer = document.querySelector( '.g-footer' );
	App.$logoWrapper = document.querySelector( '.g-logo-wrapper' );
	
	App.$imageEncoder = document.querySelector( '.g-image-encoder' );
	document.querySelector( '.g-image-encoder-cancel' ).addEventListener( 'click', App.Views.displayWelcomeScreen.bind( App ) );
	document.querySelector( '.g-image-encoder-form' ).addEventListener( 'submit', App.Encoder.start.bind( App ) );
	App.Helpers.bindListener( document.querySelectorAll( '.g-image-encoder-field[name="color-space"]' ), 'click', App.Encoder.toggleBayer.bind( App ) );
	App.$imageEncoderPreloader = document.querySelector( '.g-image-encoder-preloader' );
	App.$imageEncoderPreview = document.querySelector( '.g-image-encoder-preview' );
	App.$imageEncoderPreview.addEventListener( 'click', App.Encoder.previewImage.bind( App ) );
	App.Helpers.bindListener( document.querySelectorAll( '.g-image-encoder-field[name="color-space"]' ), 'click', App.Encoder.previewImage );
	App.Helpers.bindListener( document.querySelectorAll( '.g-image-encoder-field[name="filter"]' ), 'click', App.Encoder.previewImage );
	
	App.$gifWrapper = document.querySelector( '.g-gif' );
	App.$gifCanvas = document.querySelector( '.g-gif-canvas' );
	App.$gifPlay = document.querySelector(  '.g-gif-controls-play' );
	App.$gifPause = document.querySelector( '.g-gif-controls-pause' );
	App.$gifStop = document.querySelector( '.g-gif-controls-stop' );
	App.$gifPlay.addEventListener( 'click', function( e ) {
		App.Views.updateGifControls();
		App.$gifPlay.classList.add( 'g-gif-controls-clicked' );
		GIF.play();
	} );
	App.$gifPause.addEventListener( 'click', function( e ) {
		App.Views.updateGifControls();
		App.$gifPause.classList.add( 'g-gif-controls-clicked' );
		GIF.pause();
	} );
	App.$gifStop.addEventListener( 'click', function( e ) {
		App.Views.updateGifControls();
		App.$gifStop.classList.add( 'g-gif-controls-clicked' );
		GIF.stop();
		App.Views.displayWelcomeScreen();
	} );
	
	if( App.gui ) {
		document.querySelector( '.g-github-link' ).addEventListener( 'click', function( e ) {
			e.preventDefault();
			App.gui.Shell.openExternal( this.href );
		} );
	}
	
	GIF.init( {
		canvasSelector: '.g-gif-canvas',
		libPath: './giffity/js', // relative from index.html
		imagePath: '',
	} );
	
	document.querySelector( '.g-image-loader-file' ).addEventListener( 'change', function( e )  {
		var files = e.target.files,
			l = files.length;
		
		if( !l ) {
			return;
		}
		
		var file = files[0];
		e.target.value = ''; // clean files
		if( !GIF.loadImageFromFile( file, App.isGIF.bind( App ) ) ) {
			App.Views.displayFileNotImage();
		}
	} );
	
	App.$imageLoader.addEventListener( 'dragover', function( e ) {
		e.stopPropagation();
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		
	} );
	App.$imageLoader.addEventListener( 'drop', function( e ) {
		e.stopPropagation();
		e.preventDefault();
		var files = e.dataTransfer.files,
			l = files.length;
		
		if( !l ) {
			return;
		}
		
		var file = files[0];
		if( !GIF.loadImageFromFile( file, App.isGIF.bind( App ) ) ) {
			App.Views.displayFileNotImage();
		}
	} );
	
	App.lastImageBlock = null;
	App.lastDitheredImageBlock = null;
	App.lastOptions = null;
};

App.isGIF = function( imageBlock ) {
	if( !imageBlock ) {
		// error
	}
	if( Array.isArray( imageBlock ) ) {
		App.Views.displayGIFLoaded( imageBlock );
	} else {
		App.Views.displayImageLoaded( imageBlock );
	}
};

// *********************

App.Helpers.bindListener = function( elems, type, callback ) {
	for( var i = 0, l = elems.length; i < l; i++ ) {
		elems[i].addEventListener( type, callback );
	}
};

App.Helpers.centerCanvas = function( imageBlock, $wrapperElem, $canvasElem ) {
	var centerX = imageBlock.canvasWidth/2,
		centerY = imageBlock.canvasHeight/2;
	if( imageBlock.canvasWidth < $wrapperElem.clientWidth ) {
		$canvasElem.style.left = (-imageBlock.canvasWidth + $wrapperElem.clientWidth)/2 + 'px';
	} else {
		$canvasElem.style.left = 0;
	}
	if( imageBlock.canvasHeight < $wrapperElem.clientHeight ) {
		$canvasElem.style.top = (-imageBlock.canvasHeight + $wrapperElem.clientHeight)/2 + 'px';
	} else {
		$canvasElem.style.top = 0;
	}	
};

// *********************

App.Encoder = {};
App.Encoder.options = {
	colorSpace: {
		'256': 1,
		grayscale: 2,
		monochrome: 3,
	},
	filters: {
		none: 0,
		bayer: 1,
		floyd: 2,
		stucki: 3,
		burkes: 4,
		sierra: 5,
		jarvisJudiceNinke: 6,
		stevensonArce: 7,
	}
};
App.Encoder.ditherDict = {
	'1': {
		'0': GIF.DitherType._256_COLORS,
		'2': GIF.DitherType._256_COLORS_FLOYD,
		'3': GIF.DitherType._256_COLORS_STUCKI,
		'4': GIF.DitherType._256_COLORS_BURKES,
		'5': GIF.DitherType._256_COLORS_SIERRA,
		'6': GIF.DitherType._256_COLORS_JARVIS_JUDICE_NINKE,
		'7': GIF.DitherType._256_COLORS_STEVENSON_ARCE,
	},
	'2': {
		'0': GIF.DitherType.GRAY_SCALE,
	},
	'3': {
		'0': GIF.DitherType.MONOCHROME,
		'1': GIF.DitherType.MONOCHROME_BAYER,
		'2': GIF.DitherType.MONOCHROME_FLOYD,
		'3': GIF.DitherType.MONOCHROME_STUCKI,
		'4': GIF.DitherType.MONOCHROME_BURKES,
		'5': GIF.DitherType.MONOCHROME_SIERRA,
		'6': GIF.DitherType.MONOCHROME_JARVIS_JUDICE_NINKE,
		'7': GIF.DitherType.MONOCHROME_STEVENSON_ARCE,
	},
};
App.Encoder.isEncoding = false;
App.Encoder.afterDitherCallback = null;

App.Encoder.toggleBayer = function( e ) {
	var $elem = e.target,
		$bayerOption = document.querySelector( '.g-image-encoder-field[name="filter"][value="' + App.Encoder.options.filters.bayer + '"]' ),
		$otherOptions = document.querySelectorAll( '.g-image-encoder-field[name="filter"]' ),
		i = 0, l = $otherOptions.length;
	
	if( $elem.value == App.Encoder.options.colorSpace.monochrome ) {
		for( ; i < l; i++ ) {
			$otherOptions[i].removeAttribute( 'disabled' );
		}
		$bayerOption.removeAttribute( 'disabled' );
		
	} else if( $elem.value == App.Encoder.options.colorSpace.grayscale ) {
		for( ; i < l; i++ ) {
			$otherOptions[i].setAttribute( 'disabled', 'disabled' );
		}
		document.querySelector( '.g-image-encoder-field[name="filter"][value="' + App.Encoder.options.filters.none + '"]' ).setAttribute( 'checked', 'checked' );
		
	} else if( $elem.value == App.Encoder.options.colorSpace['256'] ) {
		for( ; i < l; i++ ) {
			$otherOptions[i].removeAttribute( 'disabled' );
		}
		$bayerOption.setAttribute( 'disabled', 'disabled' );
	}
};

App.Encoder.start = function( e ) {
	if( App.Encoder.isEncoding ) {
		return;
	}
	e.preventDefault();
	var options = App.Encoder.getOptions();
	if( App.Encoder.lastOptions && App.lastDitheredImageBlock && options['color-space'] === App.Encoder.lastOptions['color-space'] && options.filter === App.Encoder.lastOptions.filter ) {
		App.Encoder.encode();
	} else {
		App.Encoder.afterDitherCallback = App.Encoder.encode.bind( App );
		App.Encoder.dither();
	}
};

App.Encoder.getOptions = function() {
	var elems = document.querySelectorAll( '.g-image-encoder-field' ),
		i = 0, l = elems.length,
		elem, name, value, options = {};
	
	for( ; i < l; i++ ) {
		elem = elems[i];
		name = elem.getAttribute( 'name' );
		value = false;
		if( elem.type === 'radio' || elem.type === 'checkbox' ) {
			if( elem.checked ) {
				value = elem.value;
			}
		}
		if( value ) {
			options[name] = value;
		}
	}
	
	return options;
};

App.Encoder.dither = function() {
	App.Encoder.isEncoding = true;
	App.$imageEncoderPreloader.style.display = 'inline-block';
	
	var options = App.Encoder.getOptions(),	
		ditherTypeCode = App.Encoder.ditherDict[options['color-space']][options.filter];
	
	App.Encoder.lastOptions = options;
	GIF.dither( App.lastImageBlock, ditherTypeCode, App.Encoder.dithered.bind( App ) );
};

App.Encoder.dithered = function( imageBlock ) {
	App.Encoder.isEncoding = false;
	App.$imageEncoderPreloader.style.display = 'none';
	if( !imageBlock ) {
		return;
	}
	App.lastDitheredImageBlock = imageBlock;
	App.Encoder.afterDitherCallback();
};

App.Encoder.encode = function() {
	App.Encoder.isEncoding = true;
	App.$imageEncoderPreloader.style.display = 'inline-block';
	
	var imageBlock = App.lastDitheredImageBlock,
		isUncompressed = document.querySelector( '.g-image-encoder-field[name="uncompressed"]' ).checked,
		isInterlaced = document.querySelector( '.g-image-encoder-field[name="interlaced"]' ).checked,
		options = {
			canvasWidth: imageBlock.canvasWidth,
			canvasHeight: imageBlock.canvasHeight,
			colorBits: imageBlock.colorBits,
			palette: imageBlock.palette,
			bitmaps: [ {
				isUncompressed: isUncompressed,
				isInterlaced: isInterlaced,
				top: 0,
				left: 0,
				width: imageBlock.canvasWidth,
				height: imageBlock.canvasHeight,
				imageData: imageBlock.imageData,
			} ],
		};
	
	GIF.encode( options, App.Encoder.download.bind( App ) );	
};

App.Encoder.download = function( file ) {
	App.Encoder.isEncoding = false;
	App.$imageEncoderPreloader.style.display = 'none';
	if( !file ) {
		return;
	}
	GIF.download( file );	
};

App.Encoder.previewImage = function( e ) {
	if( !App.$imageEncoderPreview.checked ) {
		App.Views.restoreOriginalImage();
	} else {
		var options = App.Encoder.getOptions();
		if( App.Encoder.lastOptions && App.lastDitheredImageBlock && options['color-space'] === App.Encoder.lastOptions['color-space'] && options.filter === App.Encoder.lastOptions.filter ) {
			App.Views.showPreviewImage();
		} else {
			App.Encoder.lastOptions = options;
			App.Encoder.afterDitherCallback = App.Views.showPreviewImage.bind( App );
			App.Encoder.dither();
		}
	}
};

// *********************

App.Views = {};
	
App.Views.displayWelcomeScreen = function( e ) {
	if( App.Encoder.isEncoding ) {
		return;
	}
	App.$logoWrapper.style.display = 'block';
	App.$imageLoader.style.display = 'block';
	App.$footer.style.display = 'block';
	App.$imageWrapper.style.display = 'none';
	App.$imageLoaderError.style.opacity = 0;
	App.$imageEncoderPreloader.style.display = 'none';
	App.$imageEncoderPreview.checked = false;
	App.lastImageBlock = null;
	App.lastDitheredImageBlock = null;
	App.$gifWrapper.style.display = 'none';
};

App.Views.displayImageLoaded = function( imageBlock ) {
	App.$logoWrapper.style.display = 'none';
	App.$imageLoader.style.display = 'none';
	App.$footer.style.display = 'none';
	App.$imageWrapper.style.display = 'block';
	App.$imageLoaderError.style.opacity = 0;
	App.Helpers.centerCanvas( imageBlock, App.$imageViewer, App.$imageCanvas );
	GIF.displayOnCanvas( imageBlock, App.$imageCanvas );
	App.lastImageBlock = imageBlock; // save a reference
	App.$imageEncoderPreloader.style.display = 'none';
	App.$imageEncoderPreview.checked = false;
	App.lastDitheredImageBlock = null;
	App.$gifWrapper.style.display = 'none';
};

App.Views.displayFileNotImage = function() {
	App.$imageLoaderError.style.opacity = 1;
};

App.Views.restoreOriginalImage = function() {
	App.lastImageBlock && GIF.displayOnCanvas( App.lastImageBlock, App.$imageCanvas );
};

App.Views.showPreviewImage = function() {
	App.lastDitheredImageBlock && GIF.displayOnCanvas( App.lastDitheredImageBlock, App.$imageCanvas );
};

App.Views.updateGifControls = function() {
	App.$gifPlay.classList.remove( 'g-gif-controls-clicked' );
	App.$gifPause.classList.remove( 'g-gif-controls-clicked' );
	App.$gifStop.classList.remove( 'g-gif-controls-clicked' );	
};

App.Views.displayGIFLoaded = function( imagesBlock ) {
	App.$logoWrapper.style.display = 'none';
	App.$imageLoader.style.display = 'none';
	App.$footer.style.display = 'none';
	App.$imageWrapper.style.display = 'none';
	App.$imageLoaderError.style.opacity = 0;
	App.$imageEncoderPreloader.style.display = 'none';
	App.$imageEncoderPreview.checked = false;
	App.lastImageBlock = null;
	App.lastDitheredImageBlock = null;
	App.$gifWrapper.style.display = 'block';
	App.Helpers.centerCanvas( imagesBlock[0], App.$gifWrapper, App.$gifCanvas );
	GIF.setupAnimation( imagesBlock );
	App.Views.updateGifControls();
	App.$gifPlay.classList.add( 'g-gif-controls-clicked' );
	GIF.play();
};

// *********************

App.init();