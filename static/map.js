var userIconBase = "http://www.imacoconow.net/user/";
var iconImages = [];
var liveImages = [];
var arrowImages = [];
(function() {
	if (!Date.now) {
		Date.now = function() { return +new Date; };
	}
	var iconPngs = [ "/img/car.png", "/img/keitai.png", "/img/plane.png", "/img/train.png", "/img/shinkansen.png", "/img/bus.png", "/img/cycling.png", "/img/hiker.png", "/img/motorcycling.png", "/img/helicopter.png", "/img/ferry.png" ];
	for (var i = 0; i < iconPngs.length; i++) {
		iconImages[i] = new google.maps.MarkerImage(
			iconPngs[i], null, null,
			new google.maps.Point(22, 22));
	}
	iconImages[98] = new google.maps.MarkerImage(
		"/img/typhoon.png", null, null,
		new google.maps.Point(22, 22));
	var livePngs = [ "/img/ustream.png", "/img/justin.png", "/img/nicolive.png" ];
	for (var i = 0; i < livePngs.length; i++)
		liveImages[i] = new google.maps.MarkerImage(
			livePngs[i], null, null,
			new google.maps.Point(-10, -10));
	for (var i = 0; i <= 36; i++)
		arrowImages[i] = new google.maps.MarkerImage(
			"/img/arrow.png",
			new google.maps.Size(52, 52),
			new google.maps.Point(i * 52, 0),
			new google.maps.Point(26, 26));
})();

var ImakokoMarker = function(map, latLng, user, nickname, type, dir, live, onclickCallback) {
	var self = this;
	this.user = user;
	this.nickname = nickname;
	this.icon = iconImages[type] || iconImages[0];
	this.arrow = (type == 0);
	this.live = live;
	this.info = null;
	this.userMarker = null;
	this.liveMarker = null;

	this.marker = new google.maps.Marker({
		map : map,
		positon : latLng,
		icon : this.getIcon(dir),
		clickable : (onclickCallback != null),
		draggable : false,
		flat : true,
		visible : true
	});
	if (onclickCallback != null) {
		google.maps.event.addListener(this.marker, "click", function(event) {
			onclickCallback(self);
		});
	}
	this.marker.setPosition(latLng);

	if (user) {
		this.userMarker = new google.maps.Marker({
			map : map,
			positon : latLng,
			icon : new google.maps.MarkerImage(
				userIconBase + encodeURIComponent(user) + ".png",
				null, null, new google.maps.Point(0, 24)),
			clickable : false,
			draggable : false,
			flat : true,
			visible : true
		});
		this.userMarker.setPosition(latLng);
	}

	this.updateLiveMarker();
	if (this.liveMarker)
		this.liveMarker.setPosition(latLng);
};
ImakokoMarker.prototype = {
	getIcon : function(dir) {
		if (!this.arrow || dir == null)
			return this.icon;
		dir = Number(dir);
		if (isNaN(dir))
			return this.icon;
		dir %= 360;
		if (dir < 0) dir += 360;
		return arrowImages[Math.round(dir / 10)];
	},
	updateLiveMarker : function() {
		if (this.liveMarker) {
			this.liveMarker.setMap(null);
			this.liveMarker = null;
		}
		if (!this.live) return;
		var icon;
		if (this.live == "live")
			icon = liveImages[0];
		else if (this.live == "justin.tv")
			icon = liveImages[1];
		else if (this.live.match(/^nicolive/))
			icon = liveImages[2];
		else
			return;
		this.liveMarker = new google.maps.Marker({
			map : this.marker.getMap(),
			positon : this.marker.getPosition(),
			icon : icon,
			clickable : false,
			draggable : false,
			flat : true,
			visible : true
		});
	},
	setPosition : function(latLng, dir, live) {
		if (this.live != live) {
			this.live = live;
			this.updateLiveMarker();
		}
		this.marker.setPosition(latLng);
		this.marker.setIcon(this.getIcon(dir));
		if (this.userMarker)
			this.userMarker.setPosition(latLng);
		if (this.liveMarker)
			this.liveMarker.setPosition(latLng);
	},
	destroy : function() {
		google.maps.event.clearInstanceListeners(this.marker);
		this.marker.setMap(null);
		this.marker = null;
		if (this.userMarker)
			this.userMarker.setMap(null);
		if (this.liveMarker)
			this.liveMarker.setMap(null);
	}
};

var locTracer = {
	max : 720,
	marks : [],
	cur : 0,
	prev : null,
	map : null,
	icon : new google.maps.MarkerImage("/img/aka.png"),

	addMark : function(latLng) {
		var p = this.prev;
		if (p && Math.abs(latLng.lat() - p.lat()) < 0.0002 && Math.abs(latLng.lng() - p.lng()) < 0.0002) return;
		this.prev = latLng;

		var m;
		if (this.cur < this.marks.length) {
			m = this.marks[this.cur];
		} else {
			m = new google.maps.Marker({
				map : this.map,
				positon : latLng,
				icon : this.icon,
				clickable : false,
				draggable : false,
				flat : true,
				visible : true
			});
			this.marks.push(m);
		}
		m.setPosition(latLng);

		this.cur++;
		if (this.cur >= this.max) this.cur = 0;
	},
	clear : function() {
		for (var i in this.marks) this.marks[i].setMap(null);
		this.marks = [];
		this.cur = 0;
		this.prev = null;
	}
};

var imakokoMap = {
	taskInterval : 10000,
	initialZoom : 13,

	gpsMode : false,
	gpsModeLive : null,
	staticMarker : null,
	mainUser : null,
	userListMode : false,
	userListCallback : null,
	needUpdateTitle : false,
	updateMapTitle : null,
	needShowWindow : false,

	fetchLatest : null,
	taskIntervalId : null,

	googleMap : null,
	openInfoWindow : null,
	closeInfoWindow : null,
	markerCallback : null,
	mapCenter : null,
	moveState : 0,
	idleTimeout : 0,
	latestAll : [],
	markers : {},

	refresh : function() {
		if (this.userListMode) {
			this.userListCallback(this.latestAll, this.mainUser);
			this.mainUser = null;
			return;
		}
		this.updateMarkers();
	},

	updateMarkers : function() {
		var latest = this.latestAll;
		var oldMarkers = this.markers;
		var newMarkers = {};
		var isIdle = true;
		this.gpsModeLive = null;

		for (var i = 0; i < latest.length; i++) {
			var data = latest[i];
			var user = data.user;
			var isMainUser = (user == this.mainUser);
			if (isMainUser && this.gpsMode) {
				this.gpsModeLive = data.ustream_status;
				continue;
			}

			var latLng = new google.maps.LatLng(Number(data.lat), Number(data.lon));
			var marker = oldMarkers[user];
			if (marker) {
				delete oldMarkers[user];
				marker.setPosition(latLng, data.dir, data.ustream_status);
			} else
				marker = new ImakokoMarker(this.googleMap, latLng, user, data.nickname, Number(data.type), data.dir, data.ustream_status, this.markerCallback);
			newMarkers[user] = marker;
			if (isMainUser) {
				isIdle = false;
				this.idleTimeout = 0;
				if (this.needUpdateTitle) {
					if (this.staticMarker != null) {
						this.staticMarker.destroy();
						this.staticMarker = null;
					}
					this.updateMapTitle(user, data.nickname);
					this.needUpdateTitle = false;
				}
				this.moveMap(latLng);
				if (this.needShowWindow)
					this.markerCallback(marker);
			}
		}
		this.markers = newMarkers;
		for (var key in oldMarkers)
			oldMarkers[key].destroy();
		if (isIdle && !this.gpsMode) {
			var now = Date.now();
			if (this.idleTimeout == 0) {
				this.idleTimeout = now + (locTracer.prev ? 72000000 : 7200000);
			} else if (this.idleTimeout < now) {
				this.stopFetchTask();
			}
		}
	},

	moveMap : function(latLng) {
		if (this.moveState > 0)
			this.moveState--;
		if (this.moveState == 0) {
			this.closeInfoWindow();
			this.googleMap.panTo(latLng);
		}
		this.mapCenter = latLng;
		locTracer.addMark(latLng);
	},

	moveGpsCoords : function(coords) {
		var latLng = new google.maps.LatLng(coords.latitude, coords.longitude);
		this.staticMarker.setPosition(latLng, coords.heading, this.gpsModeLive);
		this.moveMap(latLng);
	},

	initGpsMode : function(coords, user, type, markerCallback) {
		this.gpsMode = true;
		this.taskInterval = 30000;
		this.initialZoom = 14;
		this.mainUser = user;
		var latLng = new google.maps.LatLng(coords.latitude, coords.longitude);
		this.initMap(latLng);
		this.staticMarker = new ImakokoMarker(this.googleMap, latLng, null, null, Number(type), coords.heading, null, markerCallback);
		this.initFetchTask();
		this.startFetchTask();
	},

	initUserMapMode : function(user, latLng) {
		this.mainUser = user;
		this.needUpdateTitle = true;
		this.needShowWindow = true;
		if (latLng != null) {
			this.initMap(latLng);
			this.staticMarker = new ImakokoMarker(this.googleMap, latLng, user, null, 0, null, null, user ? this.markerCallback : null);
		} else
			this.initMap(new google.maps.LatLng(35.658634, 139.745411));
		this.initFetchTask();
		this.startFetchTask();
	},

	initUserListMode : function() {
		this.userListMode = true;
		this.initFetchTask();
		this.fetchLatest();
	},

	toUserMapMode : function(user, latLng) {
		this.userListMode = false;
		this.mainUser = user;
		this.needUpdateTitle = false;
		this.needShowWindow = true;
		this.moveState = 0;
		if (this.googleMap == null) {
			if (latLng == null)
				latLng = new google.maps.LatLng(35.658634, 139.745411);
			this.initMap(latLng);
		} else {
			google.maps.event.trigger(this.googleMap, "resize");
			if (latLng != null) {
				this.googleMap.setCenter(latLng);
				this.mapCenter = latLng;
			}
			this.closeInfoWindow();
			if (this.staticMarker != null) {
				this.staticMarker.destroy();
				this.staticMarker = null;
			}
			locTracer.clear();
		}
		this.startFetchTask();
	},

	toUserListMode : function() {
		this.userListMode = true;
		if (this.stopFetchTask()) {
			this.refresh();
		} else {
			this.fetchLatest();
		}
	},

	initMap : function(latLng) {
		google.maps.visualRefresh = true;
		var self = this;
		this.googleMap = new google.maps.Map(
			document.getElementById("map_canvas"),
			{
				zoom : this.initialZoom,
				center : latLng,
				mapTypeId : google.maps.MapTypeId.ROADMAP,
				mapTypeControl : false,
				scaleControl : true
			}
		);
		google.maps.event.addListener(this.googleMap, "dragstart", function() {
			self.moveState = -1;
		});
		google.maps.event.addListener(this.googleMap, "dragend", function() {
			self.moveState = 3;
		});
		this.mapCenter = latLng;
		locTracer.map = this.googleMap;

		var infowindow = new google.maps.InfoWindow();
		var windowOpen = false;
		this.openInfoWindow = function(infoDiv, latLng) {
			infowindow.setContent(infoDiv);
			infowindow.setPosition(latLng);
			infowindow.open(self.googleMap);
			windowOpen = true;
			self.moveState = 3;
		};
		this.closeInfoWindow = function() {
			if (windowOpen) {
				infowindow.close();
				windowOpen = false;
			}
		};
		google.maps.event.addListener(infowindow, "closeclick", function() {
			windowOpen = false;
			self.moveState = 0;
		});
	},

	initFetchTask : function() {
		var self = this;
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.onreadystatechange = function() {
			if (this.readyState == 4 && this.status == 200) {
				var res = JSON.parse(this.responseText.slice(1, -1));
				if (res.result) {
					self.latestAll = res.points;
					self.refresh();
				}
			}
		};
		this.fetchLatest = function() {
			try {
				xmlhttp.open("GET", "/api/latest", true);
				xmlhttp.setRequestHeader("If-Modified-Since", "Mon, 01 Jan 1990 00:00:00 GMT");
				xmlhttp.send(null);
			} catch(e) {
			}
		};
	},

	startFetchTask : function() {
		this.idleTimeout = 0;
		if (this.taskIntervalId == null) {
			this.taskIntervalId = setInterval(this.fetchLatest, this.taskInterval);
			this.fetchLatest();
		}
	},

	stopFetchTask : function() {
		if (this.taskIntervalId != null) {
			clearInterval(this.taskIntervalId);
			this.taskIntervalId = null;
			return true;
		} else {
			return false;
		}
	},

	onResize : function() {
		if (!this.userListMode && this.googleMap != null) {
			google.maps.event.trigger(this.googleMap, "resize");
			if (this.moveState == 0)
				this.googleMap.panTo(this.mapCenter);
		}
	}
};

function decodeGeocoderResponse(responses, detail) {
	var street_address = "";
	var neighborhood = "";
	var sublocality_l = "";
	var sublocality_h = "";
	var sublocality = "";
	var locality = "";
	var other = "";
	for (var i = 0; i < responses.length; i++) {
		var response = responses[i];
		if (response.types.length == 0) continue;
		switch (response.types[0]) {
			case "street_address":
				street_address = street_address || response.formatted_address;
				break;
			case "neighborhood":
				neighborhood = neighborhood || response.formatted_address;
				break;
			case "sublocality_level_5":
			case "sublocality_level_4":
			case "sublocality_level_3":
				sublocality_l = sublocality_l || response.formatted_address;
				break;
			case "sublocality_level_2":
			case "sublocality_level_1":
				sublocality_h = sublocality_h || response.formatted_address;
				break;
			case "sublocality":
				sublocality = sublocality || response.formatted_address;
				break;
			case "locality":
				locality = locality || response.formatted_address;
				break;
			case "route":
			case "postal_code":
				break;
			default:
				other = other || response.formatted_address;
		}
	}
	var area = neighborhood || sublocality_h || sublocality || locality;
	var address = (detail && (street_address || neighborhood || sublocality_l)) || area || other;
	var isJapan = /^日本(, )?/.exec(address);
	if (isJapan != null) {
		address = address.substring(isJapan[0].length);
		area = locality;
	}
	if (address)
		return { address : address, area : area };
	else
		return null;
}

var googleGeocoder = new google.maps.Geocoder();

function reverseGeocode(latLng, level, callback) {
	googleGeocoder.geocode({ location : latLng },
		function(responses, status) {
			var result = null;
			if (status == google.maps.GeocoderStatus.OK) {
				result = decodeGeocoderResponse(responses, (level == "0"));
			}
			callback(result, latLng);
		});
};

var GEOHASH_CHARS = "028b139c46df57eghksujmtvnqwyprxz";

function encodeGeohash(latitude, longitude) {
	var precision = 10;
	var lower = Math.max(Number(latitude) / 180 + 0.5, 0);
	var higher = Math.max(Number(longitude) / 360 + 0.5, 0);
	var geohash = "";
	for (var i = 0; i < precision; i++) {
		lower *= 4;
		higher *= 8;
		var bits2 = Math.min(Math.floor(lower), 3);
		var bits3 = Math.min(Math.floor(higher), 7);
		geohash += GEOHASH_CHARS.charAt(bits3 * 4 + bits2);
		var tmp = higher - bits3;
		higher = lower - bits2;
		lower = tmp;
	}
	return geohash;
}

function decodeGeohash(geohash) {
	geohash = String(geohash).toLowerCase();
	var lower = 0;
	var higher = 0;
	var hashlen = 0;
	for (var i = 0; i < geohash.length; i++) {
		var bits = GEOHASH_CHARS.indexOf(geohash.charAt(i));
		if (bits < 0) {
			if (hashlen == 0)
				continue;
			else
				break;
		}
		var tmp = higher * 4 + bits % 4;
		higher = lower * 8 + Math.floor(bits / 4);
		lower = tmp;
		if (++hashlen == 15) break;
	}
	higher += 0.5;
	lower += 0.5;
	var lat, lon;
	var scale = Math.pow(2, Math.floor(hashlen / 2) * 5);
	if (hashlen % 2 == 0) {
		lat = higher / scale;
		lon = lower / scale;
	} else {
		lat = lower / (scale * 4);
		lon = higher / (scale * 8);
	}
	return new google.maps.LatLng((lat - 0.5) * 180, (lon - 0.5) * 360);
}
