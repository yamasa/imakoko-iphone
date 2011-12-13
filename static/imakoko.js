if (!window.localStorage)
	window.localStorage = {};

function millisecToStr(millisec) {
	var minute = Math.floor(millisec / 60000);
	var hour = Math.floor(minute / 60);
	minute -= hour * 60;
	var day = Math.floor(hour / 24);
	hour -= day * 24;
	if (day)
		return day + "日" + hour + "時間" + minute + "分";
	else if (hour)
		return hour + "時間" + minute + "分";
	else
		return minute + "分";
}

var toggleTraffic = function(){};
var geoLocator = {
	imakokoUser : "",
	sessionToken : "",
	position : null,
	shasai : localStorage.imakokoShasai || "0",
	shasaiRoute : localStorage.imakokoShasaiRoute || "1",
	shasaiTosu : localStorage.imakokoShasaiTosu || "0",

	init : function() {
		this.imakokoUser = document.getElementById("imakoko_user").value;
		this.sessionToken = document.getElementById("session_token").value;

		var self = this;
		var callback = function(position) {
			self.position = position;

			var iMap = imakokoMap;
			var markerCallback;
			if (false && self.shasai == "1")
				markerCallback = self.createShasaiCallback();
			else
				markerCallback = self.createGeocodeCallback();

			iMap.initGpsMode(position.coords, self.imakokoUser, imakoko.termtype, markerCallback);
			var trafficLayer = new google.maps.TrafficLayer();
			var trafficButton = document.getElementById("traffic_button");
			trafficLayer.setMap(iMap.googleMap);
			toggleTraffic = function() {
				if (trafficLayer.getMap() != null) {
					trafficLayer.setMap(null);
					trafficButton.className = "darkButton";
				} else {
					trafficLayer.setMap(iMap.googleMap);
					trafficButton.className = "";
				}
			};

			if (false && self.shasai == "1")
				setTimeout(markerCallback, 5000);

			setInterval(function() {
				iMap.moveGpsCoords(self.position.coords);
			}, 10000);

			navigator.geolocation.watchPosition(function(position) {
				if (position.coords.accuracy < 300)
					self.position = position;
			}, null, {enableHighAccuracy:true});
		};
		try {
			navigator.geolocation.getCurrentPosition(callback, null, {enableHighAccuracy:true});
		} catch(e) {
			alert("お使いのブラウザではご利用になれません。");
		}
	},

	createShasaiCallback : function() {
		var directions = new google.maps.DirectionsService();
		var renderer;
		var noHighway = (this.shasaiRoute == "0");
		var waypoints = (this.shasaiTosu == "0") ? [] : [ { location : new google.maps.LatLng(33.395317, 130.537791), stopover : false } ];

		var callback = function(result, status) {
			if (status != google.maps.DirectionsStatus.OK) return;

			if (!renderer)
				renderer = new google.maps.DirectionsRenderer({map : imakokoMap.googleMap, hideRouteList : true, preserveViewport : true, suppressInfoWindows : true, suppressMarkers : true});
			renderer.setDirections(result);

			var leg = result.routes[0].legs[0];
			var remaining = 1318638600000 - new Date().getTime();
			var infoDiv = document.createElement("div");
			infoDiv.appendChild(document.createTextNode("第7回 車載オフ"));
			infoDiv.appendChild(document.createElement("br"));
			infoDiv.appendChild(document.createTextNode("集合場所まで: " + leg.distance.text + " " + leg.duration.text));
			if (remaining > 0) {
				infoDiv.appendChild(document.createElement("br"));
				infoDiv.appendChild(document.createTextNode("集合時刻まで: " + millisecToStr(remaining)));
			}
			imakokoMap.openInfoWindow(infoDiv, leg.start_location);
		}

		return function() {
			var coords = geoLocator.position.coords;
			directions.route({
				destination : new google.maps.LatLng(35.6013, 139.2),
				origin : new google.maps.LatLng(coords.latitude, coords.longitude),
				avoidHighways : noHighway,
				avoidTolls : noHighway,
				waypoints : waypoints,
				travelMode : google.maps.TravelMode.DRIVING
			}, callback);
		};
	},

	createGeocodeCallback : function() {
		var lAddress, lArea, lLatLng;

		var infoAddress = document.createElement("span");
		var infoTwit = document.createElement("input");
		infoTwit.type = "button";
		infoTwit.value = "Twitterへ投稿";
		infoTwit.onclick = function() {
			var code = twitter.doTwit(false, lAddress, lLatLng, lArea);
			if (code == 200)
				alert("投稿しました。");
			else if (code == 403)
				alert("重複投稿です。");
			else if (code == 400)
				alert("Twitterに投稿できません。\n設定画面で、アカウント情報を正しく入力してください。");
			else
				alert("サーバーまたはネットワークのエラーです。しばらく待ってからリロードしてみてください。\n(ステータスコード=" + code + ")");
			imakokoMap.closeInfoWindow();
		};
		var infoDiv = document.createElement("div");
		infoDiv.appendChild(infoAddress);
		infoDiv.appendChild(document.createElement("br"));
		infoDiv.appendChild(infoTwit);

		var callback = function(result, latLng) {
			if (result == null) return;
			lAddress = result.address;
			lArea = result.area;
			lLatLng = latLng;

			if (infoAddress.hasChildNodes())
				infoAddress.removeChild(infoAddress.lastChild);
			infoAddress.appendChild(document.createTextNode(lAddress));
			imakokoMap.openInfoWindow(infoDiv, latLng);
		};

		return function() {
			var coords = geoLocator.position.coords;
			reverseGeocode(new google.maps.LatLng(coords.latitude, coords.longitude), twitter.geocodeLevel, callback);
		};
	}
};

function pad(val, len) {
	val = String(val);
	len = len || 2;
	while (val.length < len) val = "0" + val;
	return val;
}
function timestampToIso(timestamp) {
	var date = new Date(timestamp);
	return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + "T" + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + "." + pad(date.getUTCMilliseconds(), 3) + "Z";
}

var imakoko = {
	url : "/api/post",
	termtype : localStorage.imakokoTermType || "0",
	interval : Number(localStorage.imakokoInterval || 20000),

	xmlhttp : null,
	changeButton : null,

	postingTimestamp : 0,
	lastTimestamp : 0,
	intervalId : null,

	init : function() {
		this.xmlhttp = new XMLHttpRequest();
		this.xmlhttp.onreadystatechange = function() {
			if (this.readyState == 4 && this.status == 200) {
				// 位置情報のPOSTに成功したらlastTimestampを更新する。
				imakoko.lastTimestamp = imakoko.postingTimestamp;
			}
		};

		var button = document.getElementById("autoimkk");
		this.changeButton = function(running) {
			if (running)
				button.className = "running";
			else
				button.className = "";
			if (document.body.className == "") {
				button.removeChild(button.lastChild);
				if (running)
					button.appendChild(document.createTextNode("自動送信停止"));
				else
					button.appendChild(document.createTextNode("自動送信開始"));
			}
		};
	},

	post : function(async, position, now) {
		var coords = position.coords;
		var timestamp = position.timestamp;
		var text = "time=" + encodeURIComponent(timestampToIso(timestamp))
					+ "&lat=" + coords.latitude.toFixed(6) + "&lon=" + coords.longitude.toFixed(6);
		if (coords.altitude != null) text += "&gpsh=" + coords.altitude.toFixed();
		if (coords.heading != null) text += "&gpsd=" + coords.heading.toFixed();
		if (coords.speed != null) text += "&gpsv=" + (coords.speed * 3.6).toFixed();
		text += "&save=0&t=" + this.termtype;
		this.postingTimestamp = now || timestamp;
		try {
			this.xmlhttp.open("POST", this.url, async);
			this.xmlhttp.setRequestHeader("X-Imakoko-Token", geoLocator.sessionToken);
			this.xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
			this.xmlhttp.send(text);
			if (async) return 200;
			if (this.xmlhttp.status == 200) {
				this.lastTimestamp = this.postingTimestamp;
			}
			return this.xmlhttp.status;
		} catch(e) {
			return 504;
		}
	},

	senderTask : function() {
		var position = geoLocator.position;
		// position.timestampが新しくなっていればpostする。
		if (position.timestamp > imakoko.lastTimestamp) {
			imakoko.post(true, position);
		} else {
			// そうでなくても、最後のpostから180秒以上経過していれば再postする。
			var now = new Date().getTime();
			if (now - imakoko.lastTimestamp > 180000) {
				imakoko.post(true, position, now);
			}
		}
	},

	startStop : function() {
		if (geoLocator.position == null) return;

		if (this.intervalId == null) {
			if (!localStorage.imakokoWarn) {
				if (!confirm("現在位置がWeb上に公開されます。\nよろしいですか?")) {
					return;
				}
				localStorage.imakokoWarn = "ACKED";
			}

			var code = this.post(false, geoLocator.position);
			if (code == 200) {
				this.intervalId = setInterval(this.senderTask, this.interval);
				this.changeButton(true);
			} else if (code == 400) {
				alert("今ココなう！に送信できません。\n設定画面で、アカウント情報を正しく入力してください。");
			} else {
				alert("サーバーまたはネットワークのエラーです。しばらく待ってからリロードしてみてください。\n(ステータスコード=" + code + ")");
			}
		} else {
			clearInterval(this.intervalId);
			this.intervalId = null;

			this.xmlhttp.abort();

			this.changeButton(false);
		}
	}
};


var twitter = {
	url : "/twitter/twit",
	mapHost : "imakoko-iphone.appspot.com" /* location.host */,
	twitHeader : localStorage.imakokoTwitHeader || "ｲﾏｺｺ! L:",
	twitFooter : localStorage.imakokoTwitFooter || "",
	geocodeLevel : localStorage.imakokoTwitGeoLevel || "0",
	sendLocation : localStorage.imakokoTwitLocation || "BOTH",
	addHashtag : localStorage.imakokoTwitHashtag || "BOTH",

	interval : 60000,
	skipCountSuccess : Number(localStorage.imakokoTwitSkip || 19),
	skipCountSameArea : 2,

	xmlhttp : null,
	changeButton : null,

	postingArea : "",
	postedArea : "",
	intervalId : null,
	skipCounter : 0,
	checkTimer : null,

	init : function() {
		this.xmlhttp = new XMLHttpRequest();
		this.xmlhttp.onreadystatechange = function() {
			if (this.readyState == 4 && (this.status == 200 || this.status == 403)) {
				twitter.postedArea = twitter.postingArea;
				twitter.skipCounter = twitter.skipCountSuccess;
			}
		};

		var button = document.getElementById("autotwit");
		this.changeButton = function(running) {
			if (running)
				button.className = "running";
			else
				button.className = "";
			if (document.body.className == "") {
				button.removeChild(button.lastChild);
				if (running)
					button.appendChild(document.createTextNode("自動twit停止"));
				else
					button.appendChild(document.createTextNode("自動twit開始"));
			}
		};
	},

	doTwit : function(async, address, latLng, area) {
		var footer = this.twitFooter ? (" " + this.twitFooter) : "";
		if (footer.indexOf("%map%") >= 0) {
			var mapUrl = "http://" + this.mapHost + "/m/" + encodeURIComponent(geoLocator.imakokoUser) + "#" + encodeGeohash(latLng.lat(), latLng.lng());
			footer = footer.replace("%map%", mapUrl);
		}
		if (this.addHashtag == "BOTH") {
			footer += " #imacoconow";
		}
		var text = "status=" + encodeURIComponent(this.twitHeader + address + footer);
		if (this.sendLocation == "BOTH") {
			text += "&lat=" + latLng.lat().toFixed(6) + "&long=" + latLng.lng().toFixed(6);
		}
		this.postingArea = area;
		try {
			this.xmlhttp.open("POST", this.url, async);
			this.xmlhttp.setRequestHeader("X-Imakoko-Token", geoLocator.sessionToken);
			this.xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
			this.xmlhttp.send(text);
			if (async) return 200;
			if (this.xmlhttp.status == 200 || this.xmlhttp.status == 403) {
				this.postedArea = this.postingArea;
				this.skipCounter = this.skipCountSuccess;
			}
			return this.xmlhttp.status;
		} catch(e) {
			return 504;
		}
	},

	autoTwitTask : function() {
		if (twitter.skipCounter > 0) {
			twitter.skipCounter--;
			return;
		}
		var coords = geoLocator.position.coords;
		var latLng = new google.maps.LatLng(coords.latitude, coords.longitude);
		reverseGeocode(latLng, twitter.geocodeLevel, function(result, latLng) {
			if (twitter.intervalId == null || twitter.skipCounter > 0 || result == null) {
				return;
			}
			if (result.area && result.area == twitter.postedArea) {
				twitter.skipCounter = twitter.skipCountSameArea;
				return;
			}
			twitter.doTwit(true, result.address, latLng, result.area);
		});
	},

	startStop : function() {
		if (geoLocator.position == null) return;

		if (this.intervalId == null) {
			if (!localStorage.imakokoTwitWarn) {
				if (!confirm("現在位置をTwitterに投稿します。\nよろしいですか?")) {
					return;
				}
				localStorage.imakokoTwitWarn = "ACKED";
			}

			if (this.checkTimer != null)
				clearTimeout(this.checkTimer);
			this.checkTimer = setTimeout(function() {
				twitter.checkTimer = null;
				if (twitter.intervalId == null)
					twitter.changeButton(false);
			}, 30000);
			this.changeButton(true);

			var coords = geoLocator.position.coords;
			var latLng = new google.maps.LatLng(coords.latitude, coords.longitude);
			reverseGeocode(latLng, twitter.geocodeLevel, function(result, latLng) {
				if (twitter.intervalId != null) {
					return;
				}
				if (result == null) {
					alert("住所情報を取得できません。");
					twitter.changeButton(false);
					return;
				}
				var code = twitter.doTwit(false, result.address, latLng, result.area);
				if (code == 200 || code == 403) {
					twitter.intervalId = setInterval(twitter.autoTwitTask, twitter.interval);
					twitter.changeButton(true);
				} else if (code == 400) {
					alert("Twitterに投稿できません。\n設定画面で、アカウント情報を正しく入力してください。");
					twitter.changeButton(false);
				} else {
					alert("サーバーまたはネットワークのエラーです。しばらく待ってからリロードしてみてください。\n(ステータスコード=" + code + ")");
					twitter.changeButton(false);
				}
			});
		} else {
			clearInterval(this.intervalId);
			this.intervalId = null;

			this.xmlhttp.abort();

			this.changeButton(false);
		}
	}
};

window.onload = function() {
	if (typeof(window.orientation) == "number") {
		var autoimkk = document.getElementById("autoimkk");
		var autotwit = document.getElementById("autotwit");
		var updateOrientation = function() {
			switch (window.orientation) {
			case 0:
			case 180:
				document.body.className = "";
				autoimkk.removeChild(autoimkk.lastChild);
				if (autoimkk.className == "running")
					autoimkk.appendChild(document.createTextNode("自動送信停止"));
				else
					autoimkk.appendChild(document.createTextNode("自動送信開始"));
				autotwit.removeChild(autotwit.lastChild);
				if (autotwit.className == "running")
					autotwit.appendChild(document.createTextNode("自動twit停止"));
				else
					autotwit.appendChild(document.createTextNode("自動twit開始"));
				break;
			case 90:
			case -90:
				if (window.orientation == 90)
					document.body.className = "landscape";
				else
					document.body.className = "landscape right";
				autoimkk.removeChild(autoimkk.lastChild);
				autoimkk.appendChild(document.createTextNode("自動送信"));
				autotwit.removeChild(autotwit.lastChild);
				autotwit.appendChild(document.createTextNode("自動twit"));
				break;
			}
			imakokoMap.onResize();
		};
		updateOrientation();
		window.addEventListener("orientationchange", updateOrientation, false);
	}
	geoLocator.init();
	imakoko.init();
	twitter.init();
};
