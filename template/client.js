
var roomId = document.getElementsByTagName("body")[0].getAttribute("data-room-id"),
    Client = require("../lib/client"),
    BrowserUI = require("../lib/browser_ui"),
    client = new Client('ws://'+window.location.hostname+':'+window.location.port+'/', roomId),
    browserUI = new BrowserUI(client);
