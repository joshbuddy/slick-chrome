var uuid = require('node-uuid');

var BrowserUI = module.exports = function(client) {
  var ui = this;
  this.client = client;
  this.missedActivity = 0;
  this.downloads = {};
  this.inputHistory = [];
  this.historyIndex = -1;
  document.addEventListener('DOMContentLoaded', function() {
    client.init();
    ui.init();
  });

  client.on("joined", function(id) {
    history.pushState(null, null, "/"+id);
  });

  client.on("message", function(body, classname) {
    ui.displayMessage(body, classname);
  });

  client.on("addUser", function(user) {
    ui.addToUserList(user);
  });

  client.on("removeUser", function(user) {
    ui.removeFromUserList(user);
  });

  client.on("nick", function(userId, nick) {
    document.getElementById(userId).innerHTML = nick + ' (' + userId.substring(0, 6) + ')';
    ui.displayMessage([{type: 'from', value: ''}, {type: 'user', value: userId},  {type: 'text', value: " changed their nickname to: "+nick}], 'them');
  });

  client.on("emote", function(userId, emote) {
    ui.displayMessage([{type: 'from', value: ''}, {type: 'user', value: userId},  {type: 'text', value: " " + emote}], 'them');
  });

  client.on("initiatingFileSending", function(to, fileId, reader) {
    ui.createSendingProgressBar(to, fileId, reader);
    console.log("to: "+to+", fileId: "+fileId);
    client.transferFileChunk(to, fileId, 0);
  });

  client.on("fileSendingChunkRequested", function(to, fileId, chunkIndex) {
    document.getElementById(to + fileId).children[2+chunkIndex].classList.add('requested');
  });

  client.on("fileSendingChunkQueued", function(to, fileId, chunkIndex) {
    document.getElementById(to + fileId).children[2+chunkIndex].classList.add('queued');
  });

  client.on("fileSendingChunkSent", function(to, fileId, chunkIndex, bytesSent, filesize, filename) {
    document.getElementById(to + fileId).children[2+chunkIndex].classList.add('done');
    ui.updateSendingProgressBar(to, fileId, bytesSent, filesize, filename);
  });

  client.on("fileChunkRequested", function(fileId, chunkIndex) {
    document.getElementById(fileId).children[1+chunkIndex].classList.add('requested');
  });

  client.on("receivedMoreBytes", function(fileId, chunkIndex, bytesReceived, startTime) {
    console.log("receivedMoreBytes fileId: "+fileId+" chunkIndex:"+chunkIndex);
    document.getElementById(fileId).children[1+chunkIndex].classList.add('queued');
    ui.updateReceivingProgressBar(fileId, bytesReceived, startTime);
  });

  client.on("fileChunkWritten", function(fileId, chunkIndex, bytesWritten) {
    document.getElementById(fileId).children[1+chunkIndex].classList.add('done');
  });

  client.on("fileComplete", function(fileId, url) {
    ui.completeFile(fileId, url);
  });

  client.on("open", function() {
    var usersList = document.getElementById('users-list');
    var name = document.createElement("div");
    name.id = client.publicKey;
    name.className = "name";
    name.innerHTML = "&#9733; "+client.publicKey.substring(0, 6);
    usersList.appendChild(name);
  })
}

BrowserUI.prototype.init = function() {
  window.onfocus = function () {
    this.missedActivity = 0;
    document.title = "Slick!";
  };

  console.log("browser ui!")

  var ui = this;
  var client = this.client;
  this.chatWindow = document.getElementById('chat-window');
  this.chatWindow.addEventListener('dragover', function(e) { client.handleDragOver(e) }, false);
  this.chatWindow.addEventListener('drop', function(e) { client.handleFileSelect(e) }, false);

  document.getElementById('inline-media').addEventListener('click', function(evt) {
    console.log(evt.target.checked);
  })

  var joinButton = document.getElementById('join');
  joinButton.addEventListener('click', function(evt) {
    client.setupConnection();
  });

  document.getElementById('chatBox').addEventListener('keydown', function(e) {
    ui.processInput(event);
  })

  document.getElementById("password").onkeyup = function(e) {
    if (isSecure()) {
      document.getElementById('room-status').innerHTML = 'locked';
    } else {
      document.getElementById('room-status').innerHTML = 'unlocked';
    }
    client.password = document.getElementById("password").value;
  }
}

BrowserUI.prototype.scrollToBottom = function() {
  this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
}

BrowserUI.prototype.jumpToEndOfChatBox = function() {
  var end = document.getElementById('chatBox').value.length;
  document.getElementById('chatBox').focus();
  window.setTimeout(function() {
    document.getElementById('chatBox').setSelectionRange(end, end);
  }, 0);
}

BrowserUI.prototype.processInput = function(e) {
  // up
  if (e.keyCode==38) {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      document.getElementById('chatBox').value = this.inputHistory[this.historyIndex];
      this.jumpToEndOfChatBox();
    }
  }
  // down
  if (e.keyCode==40) {
    if (this.historyIndex < this.inputHistory.length - 1) {
      this.historyIndex++;
      document.getElementById('chatBox').value = this.inputHistory[this.historyIndex];
      this.jumpToEndOfChatBox();
    }
  }
  // enter
  if (e.keyCode==13) {
    var text = document.getElementById('chatBox').value;
    this.inputHistory.push(text);
    this.historyIndex = this.inputHistory.length;
    if (text.indexOf('/') == 0) {
      var endOfCommand = text.indexOf(' ');
      if (endOfCommand < 1) {
        endOfCommand = text.length;
      }
      var command = text.substring(1, endOfCommand);
      switch(command) {
        case 'me':
          var emote = text.substring(endOfCommand + 1, text.length);
          var me = this.client.publicKey.substring(0, 6);
          if (this.client.nick) {
            me = this.client.nick;
          }
          this.displayMessage([{type: 'text', value: me + ' '+ emote}], 'me');
          var message = {type: "emote", emote: emote};
          this.client.sendMessage(message);
        break;
        case 'nick':
          var endOfNick = text.indexOf(' ', endOfCommand + 1);
          if (endOfNick < 1) {
            endOfNick = text.length;
          }
          if (endOfNick - endOfCommand > 0) {
            var nick = text.substring(endOfCommand + 1, endOfNick);
            document.getElementById(this.client.publicKey).innerHTML = "&#9733; "+nick+' ('+this.client.publicKey.substring(0, 6)+')';
            this.displayMessage([{type: 'text', value: 'Nickname changed to: '+nick}], 'me');
            var message = {type: "nick", nick: nick};
            this.client.sendMessage(message);
            this.client.nick = nick;
          } else {
            this.displayMessage([{type: 'text', value: 'Invalid nick.'}], 'me');
          }
        break;
      }
    } else {
      var message = {type: "chat", message: document.getElementById('chatBox').value};
      this.client.sendMessage(message);

      this.displayMessage([{type: 'from', value: 'me'}, {type: 'text', value: document.getElementById('chatBox').value}], 'me');
    }
    document.getElementById('chatBox').value = "";
    this.scrollToBottom();
  }
  return true;
}

BrowserUI.prototype.isDark = function(hex) {
  var hexString = hex.toString();
  if (hexString.charAt(0) == '#') {
    hexString = hexString.substring(1, hexString.length);
  }
  var count = 0;
  if (hexString.charAt(0) <= '4') {
    count++;
  }
  if (hexString.charAt(2) <= '4') {
    count++;
  }
  if (hexString.charAt(4) <= '4') {
    count++;
  }
  return count >= 2;
}

/**
 * Example:
 * [{type: 'from', value: '<nick>'},
 *  {type: 'text', value: 'Hello my name is '},
 *  {type: 'user', value: '<nick>'},
 *  {type: 'text', value: ' and I am here to offer you:'}
 *  {type: 'file', value: '<fileId>'}]
 * user gets their own type because eventually they will be clickable for PMs
 **/
BrowserUI.prototype.displayMessage = function(serializedMessage, classname) {
  var newMessage = document.createElement("p");
  newMessage.className = classname;
  for (var i=0; i<serializedMessage.length; i++) {
    var messagePart = serializedMessage[i];
    switch(messagePart['type']) {
      case 'text':
        var chatMessage = document.createTextNode(messagePart['value']);
        newMessage.appendChild(chatMessage);
      break;
      case 'from':
        var name = document.createElement("span");
        name.className = "name";
        var displayname = "";
        switch(messagePart['value']) {
          case "me":
            displayname = (this.client.isSecure() ? " me L " : " me U ");
            name.style.color = '#'+this.client.publicKey.substring(0, 6);
            if (this.isDark(this.client.publicKey.substring(0, 6))) {
              name.style.backgroundColor = '#dfdfdf';
            }
          break;
          case "":
          break;
          default:
            displayname = " " + this.client.users[messagePart['value']].user.getName();
            name.style.color = '#'+messagePart['value'].substring(0, 6);
            if (this.isDark(messagePart['value'].substring(0, 6))) {
              name.style.backgroundColor = '#dfdfdf';
            }
        }
        name.innerHTML = (new Date()).toLocaleTimeString() + displayname + ":&nbsp;";
        newMessage.appendChild(name);
      break;
      case 'user':
        var name = document.createElement("span");
        name.className = "name";
        name.innerHTML = this.client.users[messagePart['value']].user.getName();
        name.style.color = '#'+messagePart['value'].substring(0, 6);
        if (this.isDark(messagePart['value'].substring(0, 6))) {
          name.style.backgroundColor = '#dfdfdf';
        }
        newMessage.appendChild(name);
      break;
      case 'file':
        var file = document.createElement("span");
        file.id = "fileoffer-"+messagePart['value'];
        file.className = "available-file";
        var self = this;
        file.onclick = function() {
          var fileId = this.id.substring(this.id.indexOf('-') + 1, this.id.length);

          if (self.client.possibleFiles[fileId].url) {
            self.completeFile(fileId);
          } else {
            console.log('creating progress bar')
            var progressBar = document.createElement("div");
            progressBar.id = fileId;
            console.log('fileId:'+fileId)
            progressBar.className = "progress-bar";
            var progressText = document.createElement("p");
            progressText.className = "progress-text";
            progressBar.appendChild(progressText);
            var chunkCount = self.client.possibleFiles[fileId].chunkCount;
            for (var i=0; i<chunkCount; i++) {
              var progress = document.createElement("span");
              progress.classList.add("chunk");
              progress.classList.add("unrequested");
              progressBar.appendChild(progress);
            }
            console.log('chunkCount:'+chunkCount)
            document.getElementById('progress-list').appendChild(progressBar);
            self.client.createWriter(fileId);
          }
        }
        file.innerHTML = this.client.possibleFiles[messagePart['value']].name + " ("+this.client.possibleFiles[messagePart['value']].size + " bytes)";
        newMessage.appendChild(file);
      break;
      case 'download':
        var fileId = messagePart['fileId'];
        var file = document.createElement("a");
        file.setAttribute('download', this.client.possibleFiles[fileId].name);
        file.className = "file";
        file.innerHTML = this.client.possibleFiles[fileId].name;
        file.href = messagePart['url'];
        newMessage.appendChild(file);
      break;
    }
  }
  this.chatWindow.appendChild(newMessage);
  this.scrollToBottom();
  if (document.hidden) {
    // TODO: Josh add favicon here
    this.missedActivity++;
    document.title = "("+this.missedActivity+") Slick!";
  }
}

BrowserUI.prototype.createSendingProgressBar = function(to, fileId, reader) {
  if (!document.getElementById(to + fileId)) {
    this.downloads[to + fileId] = Date.now();
    var progressBar = document.createElement("div");
    progressBar.id = to + fileId;
    progressBar.className = "progress-bar";
    var progressText = document.createElement("p");
    progressText.className = "progress-text";
    progressBar.appendChild(progressText);
    var transferStart = document.createElement("input");
    transferStart.setAttribute("type", "hidden");
    transferStart.setAttribute("value", Date.now());
    progressBar.appendChild(transferStart);
    for (var i=0; i< reader.chunkCount; i++) {
      var progress = document.createElement("span");
      progress.classList.add("chunk");
      progress.classList.add("unrequested");
      progressBar.appendChild(progress);
    }
    document.getElementById('progress-list').appendChild(progressBar);
  }
}

BrowserUI.prototype.updateSendingProgressBar = function(to, fileId, bytesSent, filesize, filename) {
  var speed = ((bytesSent/1024/1024) / ((Date.now()-this.downloads[to + fileId]) / 1000)).toFixed(2) + "MB/sec"
  document.getElementById(to + fileId).children[0].innerHTML = "Sending " + filename + " to " + this.client.users[to].user.getName() + " (" + Math.floor(bytesSent/filesize * 100) + "%) " + speed;
  if (bytesSent == filesize) {
    document.getElementById('progress-list').removeChild(document.getElementById(to + fileId));
    this.displayMessage([{type: 'from', value: ''}, {type: 'text', value: filename + " sent to "}, {type: 'user', value: to}], 'them');
  }
}

BrowserUI.prototype.updateReceivingProgressBar = function(fileId, bytesReceived, startTime) {
  var filesize = this.client.possibleFiles[fileId].size;
  var filename = this.client.possibleFiles[fileId].name;
  document.getElementById(fileId).children[0].innerHTML = filename + " (" + Math.floor(bytesReceived/filesize * 100) + "%) "+((bytesReceived/1024/1024)/((Date.now()-startTime)/1000)).toFixed(2) + "MB/sec";
}

BrowserUI.prototype.completeFile = function(fileId, url) {
  if (document.getElementById(fileId)) {
    document.getElementById('progress-list').removeChild(document.getElementById(fileId));
  }
  if (url) this.client.possibleFiles[fileId].url = url;
  url = this.client.possibleFiles[fileId].url;
  var inlined = false;
  console.log("type:"+this.client.possibleFiles[fileId].type);
  if ((/^image/).test(this.client.possibleFiles[fileId].type)) {
    inlined = true;
    // should this be moved to displayMessage or something else in chatwindow.js?
    var img = document.createElement("img");
    img.setAttribute('class', 'inline');
    img.src = url;
    var self = this;
    img.onload = function() {
      var originalHeight = this.height;
      var originalWidth = this.width;
      if (originalWidth < self.chatWindow.offsetWidth) {
        this.style.width = originalWidth + "px";
        this.style.height = originalHeight + "px";
      } else if (originalHeight > originalWidth) {
        this.style.height = "100%";
        this.style.width = "auto";
      } else {
        this.style.width = "100%";
        this.style.height = "auto";
      }
      img.onclick = function() {
        if (this.style.width == originalWidth + "px" && this.style.height == originalHeight + "px") {
          if (originalHeight > originalWidth) {
            this.style.height = "100%";
            this.style.width = "auto";
          } else {
            this.style.width = "100%";
            this.style.height = "auto";
          }
        } else {
          this.style.width = originalWidth + "px";
          this.style.height = originalHeight + "px";
        }
      }
    }
    this.chatWindow.appendChild(img);
  } else if ((/^audio/).test(this.client.possibleFiles[fileId].type)) {
    inlined = true;
    var audio = document.createElement("audio");
    audio.setAttribute("src", url);
    audio.setAttribute("controls", "");
    this.chatWindow.appendChild(audio);
  } else if ((/^video/).test(this.client.possibleFiles[fileId].type)) {
    inlined = true;
    var video = document.createElement("video");
    video.setAttribute("src", url);
    video.setAttribute("controls", "");
    this.chatWindow.appendChild(video);
  }
  this.displayMessage([{type: 'from', value: ""}, {type: 'download', url: url, fileId: fileId}, {type: 'text', value: ' received from '}, {type: 'user', value: this.client.possibleFiles[fileId].from}], 'them');
}

BrowserUI.prototype.addToUserList = function(user) {
  var usersList = document.getElementById('users-list');
  var name = document.createElement("div");
  name.id = user.key;
  name.className = "name";
  name.innerHTML = user.getName();
  usersList.appendChild(name);
}

BrowserUI.prototype.removeFromUserList = function(user) {
  document.getElementById('users-list').removeChild(document.getElementById(user.key));
}