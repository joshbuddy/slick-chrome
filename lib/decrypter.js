var sjcl = require('./sjcl'),
    Base64 = require('./base64');

self.addEventListener('message', function(evt) {
  var data = evt.data.message;
  var decrypted = JSON.parse(sjcl.decrypt(evt.data.password, data));
  var sig = sjcl.codec.hex.toBits(decrypted.sig);
  var pub = sjcl.codec.hex.toBits(decrypted.pub);
  var pubHex = decrypted.pub;
  var message = decrypted.message;
  var point = sjcl.ecc.curves.c384.fromBits(pub);
  var publicKey = new sjcl.ecc.ecdsa.publicKey(sjcl.ecc.curves.c384, point);

  if (publicKey.verify(message, sig)) {
    var json = JSON.parse(message);
    var transfers = undefined;
    if (json.chunk) {
      console.log("chunk...");
      json.chunk = Base64.decode(json.chunk);
      transfers = [ json.chunk ];
    }
    json.id = evt.data.id;
    json.pub = pubHex;
    postMessage(json, transfers);
  } else {
    console.log("not signed correctly");
  }
}, false);
