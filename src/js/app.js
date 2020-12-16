var app = angular.module('dynastyDashboard', ['ngRoute']);

var utcDateFormat = "YYYY-MM-DDTHH:mm:ss.SSSZZ";

$.fn.modal.Constructor.prototype.enforceFocus = function() {};

var config = {
		apiKey: "AIzaSyC9Xp_f0Q5Gg02RFJ5GYsoyH0uiu7-PGXQ",
		authDomain: "dynastydashboard.firebaseapp.com",
		databaseURL: "https://dynastydashboard-default-rtdb.firebaseio.com/",
		storageBucket: "gs://dynastydashboard.appspot.com",
	},
	dynastyDashboardFirebase = firebase.initializeApp(config),
	dynastyDashboardDatabase = dynastyDashboardFirebase.database(),
	dynastyDashboardStorage = dynastyDashboardFirebase.storage(),
	provider = new firebase.auth.GoogleAuthProvider();

 app.factory('loginService', function($location, $rootScope, $route) {
    return {
        loginReload: function() {
        	if(!$rootScope.user){
		        this.loginPromise().then(function(){
		        	applyRootScope();
		        	$route.reload();
		        });
			}else{
				$route.reload();
			}
        },

        loginDashboard: function() {
        	if(!$rootScope.user){
		        this.loginPromise().then(function(){
					$location.path("/user/" + $rootScope.user.uid);
				});
			}else{
				$location.path("/user/" + $rootScope.user.uid);
			}
        },

        logout: function(){
        	firebase.auth().signOut().then(function() {
        		$rootScope.user = undefined;
        		$rootScope.$apply();
				$route.reload();
			}).catch(function(error) {
				console.error(error);
				$route.reload();
			});
        },

        loginPromise: function(){
			return new Promise(function(resolve, reject) {
				firebase.auth().signInWithPopup(provider).then(function(result) {
					$rootScope.user = result.user;
					$rootScope.$apply();
					updateUserInfo($rootScope.user).then(function(){
						resolve();
					});
				}).catch(function(error) {
					console.error(error);
					resolve();
				});
			});
		}
    };

});


app.controller('ParentController', function($scope, $location, loginService, $rootScope, $timeout) {

	var newTagPrefix = "NewTag-";

	$rootScope.carUsers = {};

	$scope.init = function(){
		$rootScope.cache = {
			dynasty101: {players: {}, picks: {}},
			mfl: {players: {}}
		};
		userInit();
	};

	$scope.login = function($event){
		$event.preventDefault();
		loginService.loginReload();
	};

	$scope.loginToDashboard = function($event){
		$event.preventDefault();
		loginService.loginDashboard();
	};

	$scope.logout = function($event){
		$event.preventDefault();
		loginService.logout();
	};

	$scope.openModal = function($event, modal){
		$event.preventDefault();
		$event.stopImmediatePropagation();
		$("#" + modal).modal(true);
	};

	$scope.showBirthdate = function(datetime){
		if(datetime){
			var birthdate = moment(datetime * 1000);
			return birthdate.format("MM/DD/YYYY") + " (" + moment().diff(birthdate, "years") + ")";
		}else{
			return "";
		}
	};

	retrievePlayer = function(playerId, league){
		if($rootScope.players && $rootScope.players[playerId]){
			return $rootScope.players[playerId];
		}else{
			loadPlayers(playerId, league).then(function(){
				return $rootScope.players[playerId];
			});
		}
	};

	loadAllPlayers = function(league){
		return new Promise(function(resolve, reject){
			dynastyDashboardDatabase.ref("cache/mfl/players").once("value", function(data){
				var cachedPlayerData = data.val();

				if(cachedPlayerData && cachedPlayerData.lastUpdated && moment(cachedPlayerData.lastUpdated, utcDateFormat).isSame(moment(), "day")){
					$rootScope.cache.mfl.players = cachedPlayerData.players;
					resolve();
				}else{
					mflExport("players", $rootScope.mflCookies, "tempPlayers", league, "DETAILS=1").then(function(){
						if(Array.isArray($scope.tempPlayers.players.player)){
							$.each($scope.tempPlayers.players.player, function(index, player){
								$rootScope.cache.mfl.players[player.id] = player;
							});

							var firebaseMFLPlayers = {
								players: $rootScope.cache.mfl.players,
								lastUpdated: moment().tz(moment.tz.guess()).format(utcDateFormat)
							};

							dynastyDashboardDatabase.ref("cache/mfl/players").update(firebaseMFLPlayers).then(function(){
								resolve();
							});
						}else{
							$rootScope.cache.mfl.players[$scope.tempPlayers.players.player.id] = $scope.tempPlayers.players.player;
							resolve();
						}			
					});
				}
			});
		});
	};

	dynasty101PickTradeValue = function(year, estimatedPick, leagueInfo){
		return new Promise(function(resolve, reject){
			var pickName = dynasty101PickName(year, estimatedPick, leagueInfo.league.franchises.count),
				pickKey = dynasty101PickKey(year, estimatedPick, leagueInfo.league.franchises.count);
			if(pickName){
				if($rootScope.cache.dynasty101.picks[pickKey] && $rootScope.cache.dynasty101.picks[pickKey].value){
					resolve();
				}else{
					dynastyDashboardDatabase.ref("cache/dynasty101/picks/" + pickKey).once("value", function(data){
						var cachedPickData = data.val();
						if(cachedPickData && cachedPickData.lastUpdated && moment(cachedPickData.lastUpdated, utcDateFormat).isSame(moment(), "day")){
							$rootScope.cache.dynasty101.picks[pickKey] = cachedPickData;
							resolve();
						}else{
							var body = {
								info: pickName,
								QB: is2QB(leagueInfo) ? "2QBValue" : "1QBValue"
							};

							$.ajax({
								url: "/.netlify/functions/dynasty-101-value",
								type: "POST",
								data: JSON.stringify(body),
								contentType:"application/json",
								dataType:"json",
								success: function(data){
									$rootScope.cache.dynasty101.picks[pickKey] = {
										pickName: pickName,
										value: data.value,
										tier: data.tier,
										lastUpdated: moment().tz(moment.tz.guess()).format(utcDateFormat)
									};
									dynastyDashboardDatabase.ref("cache/dynasty101/picks/" + pickKey).update($rootScope.cache.dynasty101.picks[pickKey]).then(function(){
										resolve();
									});
								}
							});
						}
					});
				}
			}else{
				resolve();
			}
		});
	};

	dynasty101PickKey = function(year, estimatedPick, teamCount){
		var pickName = dynasty101PickName(year, estimatedPick, teamCount);
		if(pickName){
			return pickName.replaceAll(" ", "");
		}else{
			return "";
		}
	};

	dynasty101PickName = function(year, estimatedPick, teamCount){
		if(year == "2021"){
			var splitPick = estimatedPick.split("."),
				round = parseInt(splitPick[0]),
				pick = parseInt(splitPick[1]),
				totalPick = ((round - 1) * teamCount) + pick;
			return "2021 Pick " + totalPick.toString();
		}else if(year == "2022"){
			var splitPick = estimatedPick.split("."),
				round = parseInt(splitPick[0]),
				pick = parseInt(splitPick[1]),
				pickPercentage = pick/teamCount,
				roundString, pickString;

			if(round == 1){
				roundString = "1st";
			}else if(round == 2){
				roundString = "2nd";
			}else if(round == 3){
				roundString = "3rd";
			}else{
				roundString = round.toString() + "th";
			}

			if(pickPercentage <= 0.33){
				pickString = "Early ";
			} else if(pickPercentage <= 0.66){
				pickString = "Mid ";
			} else {
				pickString = "Late ";
			}

			return "2022 " + pickString + roundString;
		}else{
			return false;
		}
	};

	dynasty101TradeValue = function(player, leagueInfo){
		return new Promise(function(resolve, reject){
			findDynasty101Player(player).then(function(){
				if($rootScope.cache.dynasty101.players[player.id]){
					if($rootScope.cache.dynasty101.players[player.id].value 
						&& $rootScope.cache.dynasty101.players[player.id].lastUpdated
						&& moment($rootScope.cache.dynasty101.players[player.id].lastUpdated, utcDateFormat).isSame(moment(), "day")){
						resolve();
					}else{
						var body = {
							info: $rootScope.cache.dynasty101.players[player.id].name,
							QB: is2QB(leagueInfo) ? "2QBValue" : "1QBValue"
						};

						$.ajax({
							url: "/.netlify/functions/dynasty-101-value",
							type: "POST",
							data: JSON.stringify(body),
							contentType:"application/json",
							dataType:"json",
							success: function(data){
								$rootScope.cache.dynasty101.players[player.id].value = data.value;
								$rootScope.cache.dynasty101.players[player.id].tier = data.tier;
								$rootScope.cache.dynasty101.players[player.id].lastUpdated = moment().tz(moment.tz.guess()).format(utcDateFormat);
								dynastyDashboardDatabase.ref("cache/dynasty101/players/" + player.id).update($rootScope.cache.dynasty101.players[player.id]).then(function(){
									resolve();
								});
							}
						});
					}
				}else{
					$rootScope.cache.dynasty101.players[player.id] = {
						value: "0",
						tier: "T11"
					}
					resolve();
				}
			});
		});
	};

	findDynasty101Player = function(player){
		return new Promise(function(resolve, reject){
			if(!$rootScope.cache.dynasty101.players[player.id]){
				dynastyDashboardDatabase.ref("cache/dynasty101/players/" + player.id).once("value", function(data){
					var dynasty101Player = data.val();
					if(dynasty101Player 
						&& (!dynasty101Player.error 
							|| (dynasty101Player.lastUpdated 
								&& moment(dynasty101Player.lastUpdated, utcDateFormat).isSame(moment(), "day")))){
						$rootScope.cache.dynasty101.players[player.id] = dynasty101Player;
						resolve();
					}else{
						var splitPlayerName = player.name.split(","),
							body = {
								entry: splitPlayerName[1].trim() + " " + splitPlayerName[0].trim()
							};

						$.ajax({
							url: "/.netlify/functions/dynasty-101-search",
							type: "POST",
							data: JSON.stringify(body),
							contentType:"application/json",
							dataType:"json",
							success: function(data){
								$rootScope.cache.dynasty101.players[player.id] = data;
								dynastyDashboardDatabase.ref("cache/dynasty101/players/" + player.id).update(data).then(function(){
									resolve();
								});
							}, error: function(error){
								console.error("unable to find " + player.name + " in Dynasty 101. MFL Id: " + player.id);
								console.error(error);
								$rootScope.cache.dynasty101.players[player.id] = {
									error: true,
									lastUpdated: moment().tz(moment.tz.guess()).format(utcDateFormat),
									value: "0",
									tier: "T11"
								};
								dynastyDashboardDatabase.ref("cache/dynasty101/players/" + player.id).update($rootScope.cache.dynasty101.players[player.id]).then(function(){
									resolve();
								});
							}
						});
					}
				});
			}else{
				resolve();
			}
		});
	};

	is2QB = function(leagueInfo){
		var twoQb = false;
		$.each(leagueInfo.league.starters.position, function(index, position){
			if(position.name == "QB" && position.limit == "1-2"){
				twoQb = true;
			}
		});
		return twoQb;
	};

	mflExport = function(type, mflCookies, saveTo, league, otherParams, method, saveToTwo){
		return new Promise(function(resolve, reject){
			var body = {
					mflCookies: mflCookies
				},
				queryParams = "";

			if(otherParams){
				queryParams += "&" + otherParams;
			}

			if(league){
				if(league.league_id){
					queryParams += "&L=" + league.league_id;
				}
				if(league.url){
					body.hostname = league.url.substr(league.url.indexOf("://") + 3).split("/")[0];
				}
			}

			if(method){
				body.method = method;
			}

			$.ajax({
				url: "/.netlify/functions/mfl-export?TYPE=" + type + queryParams,
				type: "POST",
				data: JSON.stringify(body),
				contentType:"application/json",
				dataType:"json",
				success: function(data){
					if(saveToTwo){
						$scope[saveTo][saveToTwo] = data;
					}else{
						$scope[saveTo] = data;
					}
					resolve();
				}
			});
		});
	};

	validMflLogin = function(){
		return new Promise(function(resolve, reject){
			if($rootScope.user){
				if(!$rootScope.mflCookies){
					retrieveMflCookies($rootScope.user.uid).then(function(){
						if(!validMflCookies($rootScope.mflCookies)){
							$rootScope.mflCookies = null;
						}
						resolve();
					});
				}else {
					if(!validMflCookies($rootScope.mflCookies)){
						$rootScope.mflCookies = null;
					}
					resolve();
				}
			}else{
				resolve();
			}
		});
	};

	$rootScope.validMflCookies = function(){
		if($rootScope.mflCookies){
			var expiration = $rootScope.mflCookies[1].substring($rootScope.mflCookies[1].indexOf("expires=") + 8);
			return moment(expiration).isAfter(moment());
		}else{
			return false;
		}
	};

	retrieveMflCookies = function(uid){
		return new Promise(function(resolve, reject){
			if($rootScope.mflCookies){
				resolve();
			}
			dynastyDashboardDatabase.ref("mflCookies/" + uid).once("value", function(data){
				$rootScope.mflCookies = data.val();
				resolve();
			});
		});
	};

	retrieveMfl = function(uid){
		return new Promise(function(resolve, reject){
			dynastyDashboardDatabase.ref("mfl/" + uid).once("value", function(data){
				$rootScope.mfl = data.val();
				resolve();
			});
		});
	};

	doMflLogin = function(mflUsername, mflPassword){
		return new Promise(function(resolve, reject){
			$.ajax({
				url: "/.netlify/functions/mfl-login",
				type: "POST",
				data: JSON.stringify({
					mflUsername: mflUsername,
					mflPassword: mflPassword
				}),
				contentType:"application/json",
				dataType:"json",
				success: function(data){
					$rootScope.mflCookies = data;
					updateMflCookies($rootScope.user.uid, $rootScope.mflCookies).then(function(){
						resolve();
					});
				}
			});
		});
	};

	userInit = function(){
		return new Promise(function(resolve, reject) {
			firebase.auth().onAuthStateChanged(function(var1, var2){
				if(!$rootScope.user && firebase.auth().currentUser){
					$rootScope.user = firebase.auth().currentUser;
					$rootScope.readonly = false;
					updateUserInfo($rootScope.user).then(function(){
						applyRootScope();
					});
				}
				resolve();
			});
		});
	};

	applyScope = function(){
		$timeout(function () {
		    $scope.$apply();
		}, 300);
	};

	applyRootScope = function(){
		$timeout(function () {
		    $rootScope.$apply();
		}, 300);
	};

});

app.controller('HomeController', function($scope, $rootScope, $timeout) {

	$scope.init = function(){
		
	};
});

updateMflCookies = function(uid, mflCookies){
	return new Promise(function(resolve, reject){
		dynastyDashboardDatabase.ref("mflCookies/" + uid).update(mflCookies).then(function(){
			resolve();
		});
	});
};

updateMfl = function(uid, mfl){
	return new Promise(function(resolve, reject){
		dynastyDashboardDatabase.ref("mflCookies/" + uid).update(mfl).then(function(){
			resolve();
		});
	});
};

updateUserInfo = function(user){
	return new Promise(function(resolve, reject){
		dynastyDashboardDatabase.ref("users/" + user.uid + "/info").update({
			displayName: user.displayName,
			email: user.email,
			photoURL: user.photoURL,
			uid: user.uid
		}).then(function(){
			resolve();
		});
	});
};

spinnerOn = function(){
	$('#cover-spin').show();
};

spinnerOff = function(){
	$('#cover-spin').hide();
};