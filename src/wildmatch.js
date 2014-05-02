var NEGATED_CLASS_CHAR = {
	'!': true,
	'^': true
};

var CHAR_CLASS = {
	alnum: /[a-zA-Z0-9]/,
	alpha: /[a-zA-Z]/,
	blank: /[ \t]/,
	cntrl: /[\x00-\x1F\x7F]/,
	digit: /[0-9]/,
	graph: /[\x21-\x7E]/,
	lower: /[a-z]/,
	print: /[\x20-\x7E]/,
	punct: /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/,
	space: /[ \t\r\n\v\f]/,
	upper: /[A-Z]/,
	xdigit: /[A-Fa-f0-9]/
};

function imatch(pattern, text, options, casePattern, patternPos, textPos) {
	var patternLength = pattern.length;
	var textLength = text.length;
	textPos = textPos || 0;
	patternPos = patternPos || 0;
	for (; patternPos < patternLength; patternPos++, textPos++) {
		var patternChar = pattern[patternPos];
		var textChar = text[textPos];
		
		if (!textChar && patternChar !== '*') return wildmatch.WM_ABORT_ALL;
		
		switch (patternChar) {
			case '?':
				if (!options.nopathname && textChar === '/') return wildmatch.WM_NOMATCH;
				continue;
			case '*': 
				var matchSlaches = false;
				var nbStars = 1;
				while (pattern[++patternPos] === '*') nbStars++;
				patternChar = pattern[patternPos];
				
				if (nbStars > 2)  return wildmatch.WM_ABORT_MALFORMED;
				
				if (nbStars === 2) matchSlaches = true;
				if (nbStars === 1 && options.nopathname) matchSlaches = true;
				
				if (nbStars === 2 &&
				    (patternPos < 3 || pattern[patternPos - 3] === '/') &&
				    (!patternChar || patternChar === '/')) {
					// Pattern like /**/ or **/ or /**
					
					// If we are not at the end of the patterns, we first try if **/ can be matched to the empty string
					// eg. a/**/b => a/b
					// The case at the end of the pattern is treated just bellow
					if (patternChar && imatch(pattern, text, options, casePattern, patternPos + 1, textPos) === wildmatch.WM_MATCH) {
						return wildmatch.WM_MATCH;
					}
				} else if (nbStars === 2 && !options.nopathname) {
					return wildmatch.WM_ABORT_MALFORMED;
				}
				
				if (!patternChar) {
					// We have a trailing star in the pattern
					if (!matchSlaches) {
						if (~text.indexOf('/', textPos)) {
							return wildmatch.WM_NOMATCH;
						}
					}
					return wildmatch.WM_MATCH;
				}
				
				if (!matchSlaches && patternChar === '/') {
					var slash = text.indexOf('/', textPos);
					if (slash === -1) return wildmatch.WM_NOMATCH;
					textPos = slash;
					break;
				}
				
				if (patternChar !== '[' && patternChar !== '?') {
					// If the next char in the pattern is a literal, we can skip all the char in the text until we found it
					var nextLiteral = (patternChar === '\\') ? pattern[patternPos + 1] : patternChar;
				} 
				for (; textChar; textChar = text[++textPos]) {
					if (nextLiteral) {
						var pos = text.indexOf(nextLiteral, textPos);
						if (!matchSlaches && nextLiteral !== '/') var slashPos = text.indexOf('/', textPos);
						if (pos === -1 || (!matchSlaches && (slashPos !== -1 && slashPos < pos))) {
							return wildmatch.WM_NOMATCH;
						}
						textPos = pos;
					}
					var match = imatch(pattern, text, options, casePattern, patternPos, textPos);
					if (match !== wildmatch.WM_NOMATCH) return match;
				}
				continue;
			case '[':
				if (!options.nopathname && textChar === '/') return wildmatch.WM_NOMATCH;
				if (pattern[patternPos + 1] in NEGATED_CLASS_CHAR) {
					var negated = true;
					patternPos++;
				}
				var classMatch = false;
				var classSize = -1;
				
				var noPreviousRange = true; //Cannot use the previous char as begin in a [x-y] class
				var noRange = false;
				
				for (patternPos++; patternPos < patternLength; patternPos++) {
					patternChar = pattern[patternPos];
					classSize++;
					
					if (classSize !== 0 && patternChar === ']') break;
						
					if (patternChar === '-' && !noPreviousRange && patternPos < patternLength - 1 && pattern[patternPos + 1] !== ']') {
						var previousCharCode = casePattern[patternPos - 1].charCodeAt(0);
						
						patternChar = casePattern[++patternPos];
						if (patternChar === '\\') patternChar = casePattern[++patternPos];
						var charCode = patternChar.charCodeAt(0);
						
						var textCharCode = textChar.charCodeAt(0);
						
						if (textCharCode >= previousCharCode && textCharCode <= charCode) {
							classMatch = true;
						} else if (options.nocase) {
							textCharCode = textChar.toLocaleUpperCase().charCodeAt(0);
							if (textCharCode >= previousCharCode && textCharCode <= charCode) {
								classMatch = true;
							}
						}
						noRange = true; //Prevent a second range in [a-e-n]
					} else if (patternChar === '[' && pattern[patternPos + 1] === ':') {
						patternPos += 2;
						var initialPos = patternPos;
						for (; patternPos < patternLength && pattern[patternPos] !== ']'; patternPos++);
						patternChar = pattern[patternPos];
						if (!patternChar) return wildmatch.WM_ABORT_ALL;
						
						if (pattern[patternPos - 1] === ':' && patternPos > initialPos) {
							var className = pattern.slice(initialPos, patternPos - 1);
							if (className in CHAR_CLASS) {
								if (CHAR_CLASS[className].test(textChar) ||
								    (className === 'upper' && options.nocase && CHAR_CLASS['lower'].test(textChar))) {
									classMatch = true;
								}
								noRange = true; //Prevent [[:alpha:]-z] to match 'c'
							} else {
								return wildmatch.WM_ABORT_ALL;
							}
						} else {
							// Char class contain [: but do not match [:...:]
							// Treat it like a normal char class (eg. [[:] will match [ and :)
							// We return to the fist char and treat it like a literal
							patternPos = initialPos - 2;
							if (textChar === '[') {
								classMatch = true;
							}
						}
					} else {
						if (patternChar === '\\') {
							patternChar = pattern[++patternPos];
							if (!patternChar) return wildmatch.WM_ABORT_ALL;
						}
						if (patternChar === textChar) {
							classMatch = true;
						}
					}
					noPreviousRange = noRange;
					noRange = false;
				}
				if (patternPos >= patternLength) return wildmatch.WM_ABORT_ALL;
				if (!!classMatch === !!negated) return wildmatch.WM_NOMATCH;
				continue;
			case '\\':
				patternChar = pattern[++patternPos];
				if (patternChar !== textChar) return wildmatch.WM_NOMATCH;
				continue;
			default:
				if (patternChar !== textChar) return wildmatch.WM_NOMATCH;
				continue;
		}
	}
	
	return (textPos >= textLength) ? wildmatch.WM_MATCH : wildmatch.WM_NOMATCH;
}

function match(pattern, text, options) {
	var lowPattern = pattern;
	if (options.nocase) {
		lowPattern = pattern.toLocaleLowerCase();
		text = text.toLocaleLowerCase();
	}
	if (options.matchBase) {
		if (!~pattern.indexOf('/')) {
			var lastSlash = text.lastIndexOf('/');
			if (~lastSlash) text = text.slice(lastSlash + 1);
		}
	}

	return imatch(lowPattern, text, options, pattern);
}

function wildmatch(text, pattern, options) {
	return !match(pattern, text, options || {});
}

wildmatch.c = function c(pattern, text, flags) {
	var options = {};
	if (flags & wildmatch.WM_CASEFOLD) options.nocase = true;
	if (!(flags & wildmatch.WM_PATHNAME)) options.nopathname = true;
	return match(pattern, text, options);
};

wildmatch.WM_CASEFOLD = 1;
wildmatch.WM_PATHNAME = 2;

wildmatch.WM_ABORT_MALFORMED = 2;
wildmatch.WM_NOMATCH = 1;
wildmatch.WM_MATCH = 0;
wildmatch.WM_ABORT_ALL = -1;

module.exports = wildmatch;
