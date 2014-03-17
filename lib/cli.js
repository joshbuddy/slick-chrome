var Client = require('./client');
var Server = require('./server');
var argv = require('yargs').argv;
var sys = require("sys");
var uuid = require('node-uuid');
var colors = require('colors');

if (argv.s || argv.server) {
  var server = new Server();
  var port = parseInt(argv.p || argv.port || 3000);
  console.log(colors.rainbow("Starting slick! on port "+port));
  server.listen(port);
}

if (argv.c || argv.client) {
  var showPrompt = function() {
    console.log("> ");
  }

  var id = uuid.v4();
  console.log("connecting to "+id);
  var client  = new Client("ws://localhost:3000/", id);
  client.init();
  var stdin = process.openStdin();

  showPrompt();
  stdin.addListener("data", function(d) {
    var line = d.toString().substring(0, d.length-1);
    switch(line) {
      case "/join":
        client.setupConnection();
        break;
      default:
        client.sendMessage(line);
        break;
    }
    showPrompt();
  });
}
