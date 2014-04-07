# Slick

## The easy way to send files between browsers.

This is currently in super-alpha stage, but here's what's working right now:

Slick is a web-app for chatting and sending files in a safe, encrypted way.

## Setup

To get this running, start by cloning the repo. Make sure you have redis running locally too (on the default port).
Run `npm install` to install the needed submodules and use `PORT=300 node index.js` to run a server
locally.

## Creating your first room

Once you've got a server running, connect to it using chrome (in the above example, go to http://localhost:3000/).
Then, click *join room*. Then, copy that link to another computer (with the correct hostname), and start chatting.
To send a file, drag and drop it onto the chat area. You can drag and drop multiple files at once. We are still working on directory support.

## Development

To get started with development, run `make` to compile the client. If you're going to be making lots of changes, you can
use `make watch` to always cause the client code to recompile when there are changes.

The `lib/client.js` file contains most of the client code, and `lib/browser_ui.js` contains the browser logic. Things are still incredibly primitive (this is really just a proof-of-concept), but it should be enough to get started.

## Encryption

Every file or chat message sent is first encrypted using AES-256 leveraging San Jose crypto library. (See: http://bitwiseshiftleft.github.io/sjcl/doc/symbols/sjcl.json.html). Clients can use a secret key that they only know, then, the id of the chat room is used as salt along with that password to generate a good secret key for encryption.

## Signing

Each message sent is digitally signed, and non-authentic messages are dropped on the floor.

## File chunks

When a client wants to send a big file, it's currently divided into 1 megabyte chunks. It's base64 encoded, encrypted, and sent to the other side. On the other side, the file is them reassembled and presented to the user.

## Wait, what, it's writing to disk?

So .. there are a few wacky browser techs in here that make this possible. *Web workers* are doing the background processing of chunks and encoding them. *Web sockets* are being used to send the data. The file reader and writer apis are being used to both read and write file chunks. The file writer specific is seemingly only really supported on Chrome so far. The browser can request a file sandbox to write things into, and, can present the user with a download link when the file is completely assembled. Until you've initiated the file download after it's been transferred, the file is in Chrome's file sandbox.

## Obvious things we really need to do

* Clean-up the code out of prototype stage
* Add a basic test
* Create a working CLI
* Make the interface not insane
* Store the public and private keys securely
* Not double encode the binary chunks using base64
