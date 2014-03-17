BROWSERIFY_ARGS=--exclude=**/node.js --exclude=**/webworker-threads/**/* --insert-global-vars "__filename,__dirname"

build: compile

compile: compile-slick compile-encrypter compile-decrypter

compile-slick:
	./node_modules/.bin/browserify ${BROWSERIFY_ARGS} template/client.js -o public/javascripts/client.js
	./node_modules/.bin/uglifyjs ./public/javascripts/client.js -o ./public/javascripts/client.min.js

compile-encrypter:
	./node_modules/.bin/browserify ${BROWSERIFY_ARGS} template/encrypter.js -o public/javascripts/encrypter.js
	./node_modules/.bin/uglifyjs ./public/javascripts/encrypter.js -o ./public/javascripts/encrypter.min.js

compile-decrypter:
	./node_modules/.bin/browserify ${BROWSERIFY_ARGS} template/decrypter.js -o public/javascripts/decrypter.js
	./node_modules/.bin/uglifyjs ./public/javascripts/decrypter.js -o ./public/javascripts/decrypter.min.js

watch:
	./node_modules/.bin/nodemon --watch lib --exec "make" build
