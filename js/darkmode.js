// darkmode.js: Javascript library for controlling page appearance, toggling between regular white and 'dark mode'
// Author: Said Achmiz
// Date: 2020-03-20
// When:  Time-stamp: "2020-11-22 18:02:50 gwern"
// license: PD

/* Experimental 'dark mode': Mac OS (Safari) lets users specify via an OS widget 'dark'/'light' to make everything appear */
/* bright-white or darker (eg for darker at evening to avoid straining eyes & disrupting circadian rhyhms); this then is */
/* exposed by Safari as a CSS variable which can be selected on. This is also currently supported by Firefox weakly as an */
/* about:config variable. Hypothetically, iOS in the future might use its camera or the clock to set 'dark mode' */
/* automatically. https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme */
/* https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/ */
/* https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
/* Images are handled specially: images are *not* inverted/negated by default; images with a special class, '.invertible-auto' (set on images by automated tools like ImageMagick scripts counting colors) or '.invertible' (set manually), will be inverted. (This is intended to allow inversion of images which would invert well, like statistical graphs or charts, which are typically black-on-white, and are much more pleasant to read in dark mode when inverted to white-on-black.) Inversion is removed on image hover or image-focus.js click-to-zoom. */

/* Because many users do not have access to a browser/OS which explicitly supports dark mode, cannot modify the browser/OS setting without undesired side-effects, wish to opt in only for specific websites, or simply forget that they turned on dark mode & dislike it, we make dark mode controllable by providing a widget at the top of the page. */

/****************/
/* MISC HELPERS */
/****************/

if (GW.mediaQueries == null)
    GW.mediaQueries = { };
GW.mediaQueries.mobileNarrow = matchMedia("(max-width: 520px)");
GW.mediaQueries.systemDarkModeActive = matchMedia("(prefers-color-scheme: dark)");

GW.modeOptions = [
    [ 'auto', 'Auto', 'Set light or dark mode automatically, according to system-wide setting (Win: Start→Personalization→Colors; Mac: Apple→System-Preferences→General→Appearance; iOS: Settings→Display-and-Brightness; Android: Settings→Display)' ],
    [ 'light', 'Light', 'Light mode at all times (black-on-white)' ],
    [ 'dark', 'Dark', 'Dark mode at all times (inverted: white-on-black)' ]
];

/***********/
/* HELPERS */
/***********/

/*  Adds an event listener to a button (or other clickable element), attaching
    it to both "click" and "keyup" events (for use with keyboard navigation).
    Optionally also attaches the listener to the 'mousedown' event, making the
    element activate on mouse down instead of mouse up.
    */
Element.prototype.addActivateEvent = function(func, includeMouseDown) {
    let ael = this.activateEventListener = (event) => { if (event.button === 0 || event.key === ' ') func(event) };
    if (includeMouseDown) this.addEventListener("mousedown", ael);
    this.addEventListener("click", ael);
    this.addEventListener("keyup", ael);
}

/*  Adds a scroll event listener to the page.
    */
function addScrollListener(fn, name) {
    let wrapper = (event) => {
        requestAnimationFrame(() => {
            fn(event);
            document.addEventListener("scroll", wrapper, { once: true, passive: true });
        });
    }
    document.addEventListener("scroll", wrapper, { once: true, passive: true });

    // Retain a reference to the scroll listener, if a name is provided.
    if (typeof name != "undefined")
        GW[name] = wrapper;
}

/************************/
/* ACTIVE MEDIA QUERIES */
/************************/

/*  This function provides two slightly different versions of its functionality,
    depending on how many arguments it gets.

    If one function is given (in addition to the media query and its name), it
    is called whenever the media query changes (in either direction).

    If two functions are given (in addition to the media query and its name),
    then the first function is called whenever the media query starts matching,
    and the second function is called whenever the media query stops matching.

    If you want to call a function for a change in one direction only, pass an
    empty closure (NOT null!) as one of the function arguments.

    There is also an optional fifth argument. This should be a function to be
    called when the active media query is canceled.
    */
function doWhenMatchMedia(mediaQuery, name, ifMatchesOrAlwaysDo, otherwiseDo = null, whenCanceledDo = null) {
    if (typeof GW.mediaQueryResponders == "undefined")
        GW.mediaQueryResponders = { };

    let mediaQueryResponder = (event, canceling = false) => {
        if (canceling) {
            GWLog(`Canceling media query “${name}”`);

            if (whenCanceledDo != null)
                whenCanceledDo(mediaQuery);
        } else {
            let matches = (typeof event == "undefined") ? mediaQuery.matches : event.matches;

            GWLog(`Media query “${name}” triggered (matches: ${matches ? "YES" : "NO"})`);

            if (otherwiseDo == null || matches) ifMatchesOrAlwaysDo(mediaQuery);
            else otherwiseDo(mediaQuery);
        }
    };
    mediaQueryResponder();
    mediaQuery.addListener(mediaQueryResponder);

    GW.mediaQueryResponders[name] = mediaQueryResponder;
}

/*  Deactivates and discards an active media query, after calling the function
    that was passed as the whenCanceledDo parameter when the media query was
    added.
    */
function cancelDoWhenMatchMedia(name) {
    GW.mediaQueryResponders[name](null, true);

    for ([ key, mediaQuery ] of Object.entries(GW.mediaQueries))
        mediaQuery.removeListener(GW.mediaQueryResponders[name]);

    GW.mediaQueryResponders[name] = null;
}

/******************/
/* MODE SELECTION */
/******************/

function injectModeSelector() {
    GWLog("injectModeSelector");

    // Inject the mode selector widget and activate buttons.
    let modeSelector = addUIElement(
        "<div id='mode-selector'>" +
        String.prototype.concat.apply("", GW.modeOptions.map(modeOption => {
            let [ name, label, desc ] = modeOption;
            let selected = (name == currentMode ? ' selected' : '');
            let disabled = (name == currentMode ? ' disabled' : '');
            return `<button type='button' class='select-mode-${name}${selected}'${disabled} tabindex='-1' data-name='${name}' title='${desc}'>${label}</button>`})) +
        "</div>");

    modeSelector.querySelectorAll("button").forEach(button => {
        button.addActivateEvent(GW.modeSelectButtonClicked = (event) => {
            GWLog("GW.modeSelectButtonClicked");

            // Determine which setting was chosen (i.e., which button was clicked).
            let selectedMode = event.target.dataset.name;

            // Save the new setting.
            if (selectedMode == "auto") localStorage.removeItem("selected-mode");
            else localStorage.setItem("selected-mode", selectedMode);

            // Actually change the mode.
            setMode(selectedMode);
        });
    });

    document.querySelector("head").insertAdjacentHTML("beforeend", `<style id='mode-selector-styles'>
	#mode-selector {
		position: absolute;
		right: 0;
		display: flex;
		background-color: var(--GW-mode-selector-background-color);
		padding: 0.1em 0.25em 0.3em 0.25em;
		border: 3px solid transparent;
		opacity: 0.3;
		transition:
			opacity 2s ease;
	}
	#mode-selector.hidden {
		opacity: 0;
	}
	#mode-selector:hover {
		transition: none;
		opacity: 1.0;
		border: 3px double var(--GW-mode-selector-border-hover-color);
	}
	#mode-selector button {
		-moz-appearance: none;
		appearance: none;
		border: none;
		background-color: transparent;
		padding: 0.5em;
		margin: 0 0 0 1.375em;
		line-height: 1;
		font-family: Lucida Sans Unicode, Source Sans Pro, Helvetica, Trebuchet MS, sans-serif;
		font-size: 0.75rem;
		text-align: center;
		color: var(--GW-mode-selector-button-text-color);
		position: relative;
		display: flex;
	}
	#mode-selector button::before {
		width: 1.2em;
		position: absolute;
		left: -15px;
		opacity: 0.35;
		padding: 1px 0 0 0;
	}
	#mode-selector button.select-mode-auto::before {
		content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M8 256c0 136.966 111.033 248 248 248s248-111.034 248-248S392.966 8 256 8 8 119.033 8 256zm248 184V72c101.705 0 184 82.311 184 184 0 101.705-82.311 184-184 184z"></path></svg>');
	}
	#mode-selector button.select-mode-light::before {
		content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 160c-52.9 0-96 43.1-96 96s43.1 96 96 96 96-43.1 96-96-43.1-96-96-96zm246.4 80.5l-94.7-47.3 33.5-100.4c4.5-13.6-8.4-26.5-21.9-21.9l-100.4 33.5-47.4-94.8c-6.4-12.8-24.6-12.8-31 0l-47.3 94.7L92.7 70.8c-13.6-4.5-26.5 8.4-21.9 21.9l33.5 100.4-94.7 47.4c-12.8 6.4-12.8 24.6 0 31l94.7 47.3-33.5 100.5c-4.5 13.6 8.4 26.5 21.9 21.9l100.4-33.5 47.3 94.7c6.4 12.8 24.6 12.8 31 0l47.3-94.7 100.4 33.5c13.6 4.5 26.5-8.4 21.9-21.9l-33.5-100.4 94.7-47.3c13-6.5 13-24.7.2-31.1zm-155.9 106c-49.9 49.9-131.1 49.9-181 0-49.9-49.9-49.9-131.1 0-181 49.9-49.9 131.1-49.9 181 0 49.9 49.9 49.9 131.1 0 181z"></path></svg>');
		opacity: 0.45;
		width: 1.3em;
		padding: 0;
		left: -15px;
	}
	#mode-selector button.select-mode-dark {
		margin: 0 0 0 1.125em;
	}
	#mode-selector button.select-mode-dark::before {
		content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M283.211 512c78.962 0 151.079-35.925 198.857-94.792 7.068-8.708-.639-21.43-11.562-19.35-124.203 23.654-238.262-71.576-238.262-196.954 0-72.222 38.662-138.635 101.498-174.394 9.686-5.512 7.25-20.197-3.756-22.23A258.156 258.156 0 0 0 283.211 0c-141.309 0-256 114.511-256 256 0 141.309 114.511 256 256 256z"></path></svg>');
		width: 1.15em;
		left: -12px;
	}
	#mode-selector button:not(.selected):hover::before {
		opacity: 1.0;
	}
	#mode-selector button:hover,
	#mode-selector button.selected {
		box-shadow:
			0 2px 0 6px var(--GW-mode-selector-background-color) inset,
			0 1px 0 6px currentColor inset;
	}
	#mode-selector button:not(:disabled):hover {
		color: var(--GW-mode-selector-button-hover-text-color);
		cursor: pointer;
	}
	#mode-selector button:not(:disabled):active {
		transform: translateY(2px);
		box-shadow:
			0 0px 0 6px var(--GW-mode-selector-background-color) inset,
			0 -1px 0 6px currentColor inset;
	}
	#mode-selector button.active:not(:hover)::after {
		content: "";
		position: absolute;
		bottom: 0.25em;
		left: 0;
		right: 0;
		border-bottom: 1px dotted currentColor;
		width: calc(100% - 12px);
		margin: auto;
	}
    </style>`);

    document.querySelector("head").insertAdjacentHTML("beforeend", `<style id='mode-styles'></style>`);

    // We pre-query the relevant elements, so we don’t have to run queryAll on
    // every firing of the scroll listener.
    GW.scrollState = {
        "lastScrollTop":                    window.pageYOffset || document.documentElement.scrollTop,
        "unbrokenDownScrollDistance":       0,
        "unbrokenUpScrollDistance":         0,
        "modeSelector":                     document.querySelectorAll("#mode-selector"),
    };
    addScrollListener(updateModeSelectorVisibility, "updateModeSelectorVisibilityScrollListener");
    GW.scrollState.modeSelector[0].addEventListener("mouseover", () => { showModeSelector(); });
    doWhenMatchMedia(GW.mediaQueries.systemDarkModeActive, "updateModeSelectorStateForSystemDarkMode", () => { updateModeSelectorState(); });
}

/*  Show/hide the mode selector in response to scrolling.

    Called by the ‘updateModeSelectorVisibilityScrollListener’ scroll listener.
    */
function updateModeSelectorVisibility(event) {
    GWLog("updateModeSelectorVisibility", 3);

    let newScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    GW.scrollState.unbrokenDownScrollDistance = (newScrollTop > GW.scrollState.lastScrollTop) ?
                                                        (GW.scrollState.unbrokenDownScrollDistance + newScrollTop - GW.scrollState.lastScrollTop) :
                                                        0;
    GW.scrollState.unbrokenUpScrollDistance = (newScrollTop < GW.scrollState.lastScrollTop) ?
                                                     (GW.scrollState.unbrokenUpScrollDistance + GW.scrollState.lastScrollTop - newScrollTop) :
                                                     0;
    GW.scrollState.lastScrollTop = newScrollTop;

    // Hide mode selector when scrolling a full page down.
    if (GW.scrollState.unbrokenDownScrollDistance > window.innerHeight) {
        hideModeSelector();
    }

    // On desktop, show mode selector when scrolling to top of page,
    // or a full page up.
    // On mobile, show mode selector on ANY scroll up.
    if (GW.mediaQueries.mobileNarrow.matches) {
        if (GW.scrollState.unbrokenUpScrollDistance > 0 || GW.scrollState.lastScrollTop <= 0)
            showModeSelector();
    } else if (   GW.scrollState.unbrokenUpScrollDistance > window.innerHeight
               || GW.scrollState.lastScrollTop == 0) {
        showModeSelector();
    }
}

function hideModeSelector() {
    GWLog("hideModeSelector", 3);

    GW.scrollState.modeSelector[0].classList.add("hidden");
}

function showModeSelector() {
    GWLog("showModeSelector", 3);

    GW.scrollState.modeSelector[0].classList.remove("hidden");
}

/*  Update the states of the mode selector buttons.
    */
function updateModeSelectorState() {
    // Get saved mode setting (or default).
    let currentMode = localStorage.getItem("selected-mode") || 'auto';

	// Find the mode selector widget.
    let modeSelector = document.querySelector("#mode-selector");
    if (modeSelector == null) return;

    // Clear current buttons state.
    modeSelector.childNodes.forEach(button => {
        button.classList.remove("active", "selected");
        button.disabled = false;
    });

    // Set the correct button to be selected.
    modeSelector.querySelectorAll(`.select-mode-${currentMode}`).forEach(button => {
        button.classList.add("selected");
        button.disabled = true;
    });

    // Ensure the right button (light or dark) has the “currently active”
    // indicator, if the current mode is ‘auto’.
    if (currentMode == "auto") {
        if (GW.mediaQueries.systemDarkModeActive.matches)
            modeSelector.querySelector(".select-mode-dark").classList.add("active");
        else
            modeSelector.querySelector(".select-mode-light").classList.add("active");
    }
}

/******************/
/* INITIALIZATION */
/******************/

doWhenPageLoaded(() => {
    injectModeSelector();
});
