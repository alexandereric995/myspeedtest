/*
	Edit By Alexander Eric@Eric Lapin
 */

function Speedtest() {
  this._serverList = []; //when using multiple points of test, this is a list of test points
  this._selectedServer = null; //when using multiple points of test, this is the selected server
  this._settings = {}; //settings for the speedtest worker
  this._state = 0; //0=adding settings, 1=adding servers, 2=server selection done, 3=test running, 4=done
  console.log(
   
  );
}

Speedtest.prototype = {
  constructor: Speedtest,
  /**
   * Returns the state of the test: 0=adding settings, 1=adding servers, 2=server selection done, 3=test running, 4=done
   */
  getState: function() {
    return this._state;
  },
  /**
   * Change one of the test settings from their defaults.
   * - parameter: string with the name of the parameter that you want to set
   * - value: new value for the parameter
   *
   * Invalid values or nonexistant parameters will be ignored by the speedtest worker.
   */
  setParameter: function(parameter, value) {
    if (this._state == 3)
      throw "You cannot change the test settings while running the test";
    this._settings[parameter] = value;
    if(parameter === "telemetry_extra"){
        this._originalExtra=this._settings.telemetry_extra;
    }
  },
  /**
   * Used internally to check if a server object contains all the required elements.
   * Also fixes the server URL if needed.
   */
  _checkServerDefinition: function(server) {
    try {
      if (typeof server.name !== "string")
        throw "Name string missing from server definition (name)";
      if (typeof server.server !== "string")
        throw "Server address string missing from server definition (server)";
      if (server.server.charAt(server.server.length - 1) != "/")
        server.server += "/";
      if (server.server.indexOf("//") == 0)
        server.server = location.protocol + server.server;
      if (typeof server.dlURL !== "string")
        throw "Download URL string missing from server definition (dlURL)";
      if (typeof server.ulURL !== "string")
        throw "Upload URL string missing from server definition (ulURL)";
      if (typeof server.pingURL !== "string")
        throw "Ping URL string missing from server definition (pingURL)";
      if (typeof server.getIpURL !== "string")
        throw "GetIP URL string missing from server definition (getIpURL)";
    } catch (e) {
      throw "Invalid server definition";
    }
  },
  
  addTestPoint: function(server) {
    this._checkServerDefinition(server);
    if (this._state == 0) this._state = 1;
    if (this._state != 1) throw "You can't add a server after server selection";
    this._settings.mpot = true;
    this._serverList.push(server);
  },
  
  addTestPoints: function(list) {
    for (var i = 0; i < list.length; i++) this.addTestPoint(list[i]);
  },
 
  loadServerList: function(url,result) {
    if (this._state == 0) this._state = 1;
    if (this._state != 1) throw "You can't add a server after server selection";
    this._settings.mpot = true;
    var xhr = new XMLHttpRequest();
    xhr.onload = function(){
      try{
        var servers=JSON.parse(xhr.responseText);
        for(var i=0;i<servers.length;i++){
          this._checkServerDefinition(servers[i]);
        }
        this.addTestPoints(servers);
        result(servers);
      }catch(e){
        result(null);
      }
    }.bind(this);
    xhr.onerror = function(){result(null);}
    xhr.open("GET",url);
    xhr.send();
  },
  
  getSelectedServer: function() {
    if (this._state < 2 || this._selectedServer == null)
      throw "No server is selected";
    return this._selectedServer;
  },
  
  setSelectedServer: function(server) {
    this._checkServerDefinition(server);
    if (this._state == 3)
      throw "You can't select a server while the test is running";
    this._selectedServer = server;
    this._state = 2;
  },
 
  selectServer: function(result) {
    if (this._state != 1) {
      if (this._state == 0) throw "No test points added";
      if (this._state == 2) throw "Server already selected";
      if (this._state >= 3)
        throw "You can't select a server while the test is running";
    }
    if (this._selectServerCalled) throw "selectServer already called"; else this._selectServerCalled=true;
   
    var select = function(serverList, selected) {
     
      var PING_TIMEOUT = 2000;
      var USE_PING_TIMEOUT = true; 
      if (/MSIE.(\d+\.\d+)/i.test(navigator.userAgent)) {
        
        USE_PING_TIMEOUT = false;
      }
      var ping = function(url, rtt) {
        url += (url.match(/\?/) ? "&" : "?") + "cors=true";
        var xhr = new XMLHttpRequest();
        var t = new Date().getTime();
        xhr.onload = function() {
          if (xhr.responseText.length == 0) {
           
            var instspd = new Date().getTime() - t; 
            try {
 
              var p = performance.getEntriesByName(url);
              p = p[p.length - 1];
              var d = p.responseStart - p.requestStart;
              if (d <= 0) d = p.duration;
              if (d > 0 && d < instspd) instspd = d;
            } catch (e) {}
            rtt(instspd);
          } else rtt(-1);
        }.bind(this);
        xhr.onerror = function() {
          rtt(-1);
        }.bind(this);
        xhr.open("GET", url);
        if (USE_PING_TIMEOUT) {
          try {
            xhr.timeout = PING_TIMEOUT;
            xhr.ontimeout = xhr.onerror;
          } catch (e) {}
        }
        xhr.send();
      }.bind(this);

      var PINGS = 3, 
        SLOW_THRESHOLD = 500; 
      var checkServer = function(server, done) {
        var i = 0;
        server.pingT = -1;
        if (server.server.indexOf(location.protocol) == -1) done();
        else {
          var nextPing = function() {
            if (i++ == PINGS) {
              done();
              return;
            }
            ping(
              server.server + server.pingURL,
              function(t) {
                if (t >= 0) {
                  if (t < server.pingT || server.pingT == -1) server.pingT = t;
                  if (t < SLOW_THRESHOLD) nextPing();
                  else done();
                } else done();
              }.bind(this)
            );
          }.bind(this);
          nextPing();
        }
      }.bind(this);

      var i = 0;
      var done = function() {
        var bestServer = null;
        for (var i = 0; i < serverList.length; i++) {
          if (
            serverList[i].pingT != -1 &&
            (bestServer == null || serverList[i].pingT < bestServer.pingT)
          )
            bestServer = serverList[i];
        }
        selected(bestServer);
      }.bind(this);
      var nextServer = function() {
        if (i == serverList.length) {
          done();
          return;
        }
        checkServer(serverList[i++], nextServer);
      }.bind(this);
      nextServer();
    }.bind(this);

    var CONCURRENCY = 6;
    var serverLists = [];
    for (var i = 0; i < CONCURRENCY; i++) {
      serverLists[i] = [];
    }
    for (var i = 0; i < this._serverList.length; i++) {
      serverLists[i % CONCURRENCY].push(this._serverList[i]);
    }
    var completed = 0;
    var bestServer = null;
    for (var i = 0; i < CONCURRENCY; i++) {
      select(
        serverLists[i],
        function(server) {
          if (server != null) {
            if (bestServer == null || server.pingT < bestServer.pingT)
              bestServer = server;
          }
          completed++;
          if (completed == CONCURRENCY) {
            this._selectedServer = bestServer;
            this._state = 2;
            if (result) result(bestServer);
          }
        }.bind(this)
      );
    }
  },
  
  start: function() {
    if (this._state == 3) throw "Test already running";
    this.worker = new Worker("speedtest_worker.js?r=" + Math.random());
    this.worker.onmessage = function(e) {
      if (e.data === this._prevData) return;
      else this._prevData = e.data;
      var data = JSON.parse(e.data);
      try {
        if (this.onupdate) this.onupdate(data);
      } catch (e) {
        console.error("Speedtest onupdate event threw exception: " + e);
      }
      if (data.testState >= 4) {
	  clearInterval(this.updater);
        this._state = 4;
        try {
          if (this.onend) this.onend(data.testState == 5);
        } catch (e) {
          console.error("Speedtest onend event threw exception: " + e);
        }
      }
    }.bind(this);
    this.updater = setInterval(
      function() {
        this.worker.postMessage("status");
      }.bind(this),
      200
    );
    if (this._state == 1)
        throw "When using multiple points of test, you must call selectServer before starting the test";
    if (this._state == 2) {
      this._settings.url_dl =
        this._selectedServer.server + this._selectedServer.dlURL;
      this._settings.url_ul =
        this._selectedServer.server + this._selectedServer.ulURL;
      this._settings.url_ping =
        this._selectedServer.server + this._selectedServer.pingURL;
      this._settings.url_getIp =
        this._selectedServer.server + this._selectedServer.getIpURL;
      if (typeof this._originalExtra !== "undefined") {
        this._settings.telemetry_extra = JSON.stringify({
          server: this._selectedServer.name,
          extra: this._originalExtra
        });
      } else
        this._settings.telemetry_extra = JSON.stringify({
          server: this._selectedServer.name
        });
    }
    this._state = 3;
    this.worker.postMessage("start " + JSON.stringify(this._settings));
  },
  
  abort: function() {
    if (this._state < 3) throw "You cannot abort a test that's not started yet";
    if (this._state < 4) this.worker.postMessage("abort");
  }
};
