var Server = require('./lib/server');
var colors = require('colors');
var port = process.env.PORT;

var server = new Server();
console.log(colors.rainbow("Starting slick! on port "+port));
server.listen(port);