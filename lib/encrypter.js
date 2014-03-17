var sjcl = require('./sjcl');
var Base64 = require('./base64');
var timing = require('./timing');

console.log("creating encrypter!")

self.addEventListener('message', function(evt) {
  timing.time("adding entropy");
  sjcl.random.addEntropy(sjcl.codec.hex.toBits(evt.data.rand), 1024, "crypto.getRandomValues");
  timing.timeEnd("adding entropy");
  timing.time("creating keys");
  var secretKeyBn = new sjcl.bn(evt.data.sec);
  var secretKey = new sjcl.ecc.ecdsa.secretKey(sjcl.ecc.curves.c384, secretKeyBn);
  timing.timeEnd("creating keys");
  if (evt.data.transfer) {
    timing.time("base64 transfer");
    evt.data.message.chunk = Base64.encode(evt.data.transfer);
    timing.timeEnd("base64 transfer");
  }
  timing.time("stringify message");
  var message = JSON.stringify(evt.data.message);
  timing.timeEnd("stringify message");

  timing.time("signing");
  var sig = secretKey.sign(message);
  timing.timeEnd("signing");
  timing.time("hex sign");
  var hexSig = sjcl.codec.hex.fromBits(sig);
  timing.timeEnd("hex sign");

  //var chunk = Base64.encode(evt.data.ab);

  timing.time("creating signed message");
  var signedMessage = JSON.stringify({sig: hexSig, pub: evt.data.pub, message: message});
  timing.timeEnd("creating signed message");
  timing.time("encrypting");
  var encrypted = sjcl.encrypt(evt.data.password, signedMessage);
  timing.timeEnd("encrypting");
  timing.time("posting");
  postMessage({id: evt.data.id, encrypted: encrypted});
  timing.timeEnd("posting");
}, false);
