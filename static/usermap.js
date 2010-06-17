var reloadList = function() {
	imakokoMap.fetchLatest();
};
var changeListMode = function(){};

function initMarkerCallback() {
	var iMap = imakokoMap;
	var showWindow = function(marker) {
		if (marker.marker == null || iMap.userListMode || iMap.mainUser != marker.user) return;

		var info = marker.info;
		var infoDiv = document.createElement("div");
		infoDiv.setAttribute("class", "userwindow");

		var anchor = document.createElement("a");
		anchor.setAttribute("href", "http://imakoko-gps.appspot.com/home/" + encodeURIComponent(info.name));
		anchor.setAttribute("target", "_blank");
		anchor.appendChild(document.createTextNode(info.nickname || info.name));
		infoDiv.appendChild(anchor);

		if (info.url && info.url.match(/^https?:/)) {
			infoDiv.appendChild(document.createElement("br"));
			anchor = document.createElement("a");
			anchor.setAttribute("href", info.url);
			anchor.setAttribute("target", "_blank");
			anchor.appendChild(document.createTextNode("HomePage"));
			infoDiv.appendChild(anchor);
		}

		if (info.twitter) {
			infoDiv.appendChild(document.createElement("br"));
			anchor = document.createElement("a");
			anchor.setAttribute("href", "http://twitter.com/" + info.twitter);
			anchor.setAttribute("target", "_blank");
			anchor.appendChild(document.createTextNode("Twitter"));
			infoDiv.appendChild(anchor);
		}

		var liveUrl, liveText, matchRes;
		if (marker.live == "live" && info.ust) {
			liveUrl = "http://www.ustream.tv/channel/" + info.ust;
			liveText = "LIVE on USTREAM.tv";
		} else if (marker.live == "justin.tv" && info.jtv) {
			liveUrl = "http://www.justin.tv/" + info.jtv;
			liveText = "LIVE on Justin.tv";
		} else if (marker.live && (matchRes = marker.live.match(/^nicolive:(.+)/)) != null) {
			liveUrl = "http://live.nicovideo.jp/watch/lv" + matchRes[1];
			liveText = "ニコニコ生放送中";
		}
		if (liveUrl) {
			infoDiv.appendChild(document.createElement("br"));
			anchor = document.createElement("a");
			anchor.setAttribute("href", liveUrl);
			anchor.setAttribute("target", "_blank");
			anchor.appendChild(document.createTextNode(liveText));
			infoDiv.appendChild(anchor);
		}

		iMap.openInfoWindow(infoDiv, marker.marker.getPosition());
	};

	var lMarker;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (this.readyState != 4 || this.status != 200) return;
		var info = eval(this.responseText);
		if (!info || !info.result) return;
		lMarker.info = info;
		showWindow(lMarker);
	};
	iMap.markerCallback = function(marker) {
		if (iMap.mainUser != marker.user) {
			if (iMap.staticMarker != null) {
				iMap.staticMarker.destroy();
				iMap.staticMarker = null;
			}
			iMap.mainUser = marker.user;
			iMap.updateMapTitle(marker.user, marker.nickname);
			iMap.needUpdateTitle = false;
			locTracer.clear();
			iMap.moveState = 0;
			iMap.moveMap(marker.marker.getPosition());
		}

		iMap.needShowWindow = false;
		if (marker.info) {
			showWindow(marker);
			return;
		}
		try {
			xmlhttp.open("GET", "/api/getuserinfo?user=" + encodeURIComponent(marker.user), true);
			xmlhttp.setRequestHeader("If-Modified-Since", "Mon, 01 Jan 1990 00:00:00 GMT");
			xmlhttp.send(null);
			lMarker = marker;
		} catch(e) {
		}
	};
}

window.onload = function() {
	if (typeof(window.orientation) == "number") {
		var updateOrientation = function() {
			switch (window.orientation) {
			case 0:
			case 180:
				document.body.className = "";
				break;
			case 90:
			case -90:
				document.body.className = "landscape";
				break;
			}
			imakokoMap.onResize();
		};
		updateOrientation();
		window.addEventListener("orientationchange", updateOrientation, false);
	}

	var pageTitle = document.getElementById("page_title");
	var userList = document.getElementById("user_list");
	var mapCanvas = document.getElementById("map_canvas");
	var homeButton = document.getElementById("home_button");
	var reloadButton = document.getElementById("reload_button");
	var listButton = document.getElementById("list_button");

	var changeHeader = function(text) {
		pageTitle.removeChild(pageTitle.lastChild);
		pageTitle.appendChild(document.createTextNode(text));
	};
	var toUserListMode = function() {
		listButton.style.display = "none";
		mapCanvas.style.display = "none";

		homeButton.style.display = "inline";
		reloadButton.style.display = "inline";
		userList.style.display = "block";

		document.title = "今ココ一覧！";
		changeHeader("今ココ一覧！");
		imakokoMap.toUserListMode();
	};
	var toUserMapMode = function(user, nickname, latLng) {
		homeButton.style.display = "none";
		reloadButton.style.display = "none";
		userList.style.display = "none";

		listButton.style.display = "inline";
		mapCanvas.style.display = "block";

		document.title = nickname + " - 今ココなう！";
		changeHeader(nickname);
		imakokoMap.toUserMapMode(user, latLng);
	};

	var setUserListState = function() {};
	var pushUserMapState = function(user, nickname) {};
	var updateMapTitle = function(user, nickname) {
		document.title = nickname + " - 今ココなう！";
		changeHeader(nickname);
	};
	var isListStateInHistory = false;
	if (history.pushState && history.replaceState) {
		setUserListState = function() {
			history.replaceState([], document.title, "/m/");
			isListStateInHistory = true;
		};
		pushUserMapState = function(user, nickname) {
			history.pushState([user, nickname], nickname + " - 今ココなう！", "/m/" + encodeURIComponent(user));
		};
		updateMapTitle = function(user, nickname) {
			document.title = nickname + " - 今ココなう！";
			changeHeader(nickname);
			history.replaceState([user, nickname], document.title, "/m/" + encodeURIComponent(user));
		};
		window.addEventListener("popstate", function(event) {
			if (!event || !event.state) return;
			if (event.state.length == 2)
				toUserMapMode(event.state[0], event.state[1]);
			else {
				toUserListMode();
				isListStateInHistory = true;
			}
		}, false);
	}

	changeListMode = function() {
		if (isListStateInHistory)
			history.back();
		else {
			toUserListMode();
			setUserListState();
		}
	};
	var userListSelected = function(user, nickname, latLng) {
		pushUserMapState(user, nickname);
		toUserMapMode(user, nickname, latLng);
	};
	imakokoMap.updateMapTitle = updateMapTitle;
	imakokoMap.userListCallback = function(latest, mainUser) {
		while (userList.hasChildNodes()) {
			userList.removeChild(userList.lastChild);
		}
		var mainUserIndex = -1;
		for (var i = 0; i < latest.length; i++) {
			var li = document.createElement("li");
			li.onclick = (function() {
				var data = latest[i];
				return function() {
					userListSelected(data.user, data.nickname, new google.maps.LatLng(Number(data.lat), Number(data.lon)));
				};
			})();
			li.appendChild(document.createTextNode(latest[i].nickname));
			if (latest[i].ustream_status) {
				if (latest[i].ustream_status == "live")
					li.className = "ustream";
				else if (latest[i].ustream_status == "justin.tv")
					li.className = "justin";
				else if (latest[i].ustream_status.match(/^nicolive/))
					li.className = "nicolive";
			}
			userList.appendChild(li);
			if (latest[i].user == mainUser)
				mainUserIndex = i;
		}
		if (mainUserIndex >= 0)
			setTimeout(function() {
				scrollTo(0, mainUserIndex * 37 + 25);
			}, 0);
	};
	initMarkerCallback();

	var user = decodeURIComponent(location.pathname.substring(3));
	if (user || location.hash) {
		var loc = null;
		if (location.hash) {
			loc = decodeGeohash(location.hash);
			changeHeader("過去ココ！");
		} else {
			changeHeader("今ドコ？");
		}
		listButton.style.display = "inline";
		mapCanvas.style.display = "block";
		imakokoMap.initUserMapMode(user, loc);
	} else {
		document.title = "今ココ一覧！";
		changeHeader("今ココ一覧！");
		homeButton.style.display = "inline";
		reloadButton.style.display = "inline";
		userList.style.display = "block";
		imakokoMap.initUserListMode();
		setUserListState();
	}
};
