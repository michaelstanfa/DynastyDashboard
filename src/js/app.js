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

	$rootScope.displayPlayer = function(playerId, league){
		return retrievePlayer(playerId, league);
	};

	retrievePlayer = function(playerId, league){
		if($rootScope.players[playerId]){
			return $rootScope.players[playerId];
		}else{
			loadPlayers(playerId, league).then(function(){
				return $rootScope.players[playerId];
			});
		}
	};

	loadAllPlayers = function(league){
		return new Promise(function(resolve, reject){
			mflExport("players", $rootScope.mflCookies, "tempPlayers", league).then(function(){
				if(!$rootScope.players){
					$rootScope.players = {};
				}
				if(Array.isArray($scope.tempPlayers.players.player)){
					$.each($scope.tempPlayers.players.player, function(index, player){
						$rootScope.players[player.id] = player;
					});
				}else{
					$rootScope.players[$scope.tempPlayers.players.player.id] = $scope.tempPlayers.players.player;
				}			
				resolve();	
			});
		});
	};

	loadPlayers = function(players, league){
		return new Promise(function(resolve, reject){
			mflExport("players", $rootScope.mflCookies, "tempPlayers", league, "PLAYERS=" + players).then(function(){
				if(!$rootScope.players){
					$rootScope.players = {};
				}
				if(Array.isArray($scope.tempPlayers.players.player)){
					$.each($scope.tempPlayers.players.player, function(index, player){
						$rootScope.players[player.id] = player;
					});
				}else{
					$rootScope.players[$scope.tempPlayers.players.player.id] = $scope.tempPlayers.players.player;
				}			
				resolve();	
			});
		});
	};

	tradeValue = function(player, leagueInfo){
		var body = {
			info: player.name,
			QB: is2QB(leagueInfo) ? "2QBValue" : "1QBValue"
		};

		return new Promise(function(resolve, reject){
			$.ajax({
				url: "/.netlify/functions/dynasty-101-value",
				type: "POST",
				data: JSON.stringify(body),
				contentType:"application/json",
				dataType:"json",
				success: function(data){
					$scope.tradeValue[playerId] = data;
					resolve();
				}
			});
		});
	};

	is2QB = function(leagueInfo){
		var twoQb = false;
		$.each(leagueInfo.starters.position, function(index, position){
			if(position.name == "QB" && position.limit == "1-2"){
				twoQb = true;
			}
		});
		return twoQb;
	};

	mflExport = function(type, mflCookies, saveTo, league, otherParams, method){
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
					$scope[saveTo] = data;
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