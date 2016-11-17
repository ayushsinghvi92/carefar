'use strict';

window.app = angular.module('CareFarApp', ['fsaPreBuilt', 'ui.router', 'ui.bootstrap', 'ngAnimate']);

app.config(function ($urlRouterProvider, $locationProvider) {
    // This turns off hashbang urls (/#about) and changes it to something normal (/about)
    $locationProvider.html5Mode(true);
    // If we go to a URL that ui-router doesn't have registered, go to the "/" url.
    $urlRouterProvider.otherwise('/');
    // Trigger page refresh when accessing an OAuth route
    $urlRouterProvider.when('/auth/:provider', function () {
        window.location.reload();
    });
});

// This app.run is for listening to errors broadcasted by ui-router, usually originating from resolves
app.run(function ($rootScope, $window, $location) {
    $window.ga('create', 'UA-85556846-1', 'auto');
    $rootScope.$on('$stateChangeError', function (event, toState, toParams, fromState, fromParams, thrownError) {
        console.info('The following error was thrown by ui-router while transitioning to state "${toState.name}". The origin of this error is probably a resolve function:');
        console.error(thrownError);
    });
    $rootScope.$on('$stateChangeSuccess', function (event, toState, toParams, fromState) {
        $window.ga('send', 'pageview', $location.path());
    });
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state, $window, $location) {

    // The given state requires an authenticated user.
    var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
        return state.data && state.data.authenticate;
    };

    // $stateChangeStart is an event fired
    // whenever the process of changing a state begins.
    $rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

        $window.ga('send', 'pageviewClick', $location.path());

        if (!destinationStateRequiresAuth(toState)) {
            // The destination state does not require authentication
            // Short circuit with return.
            return;
        }

        if (AuthService.isAuthenticated()) {
            // The user is authenticated.
            // Short circuit with return.
            return;
        }

        // Cancel navigating to new state.
        event.preventDefault();

        AuthService.getLoggedInUser().then(function (user) {
            // If a user is retrieved, then renavigate to the destination
            // (the second time, AuthService.isAuthenticated() will work)
            // otherwise, if no user is logged in, go to "login" state.
            if (user) {
                $state.go(toState.name, toParams);
            } else {
                $state.go('login');
            }
        });
    });
});

app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('about', {
        url: '/about',
        controller: 'AboutController',
        templateUrl: 'js/about/about.html'
    });
});

app.controller('AboutController', function ($scope, FullstackPics) {

    // Images of beautiful Fullstack people.
    $scope.images = _.shuffle(FullstackPics);
});

app.controller('DemoController', function ($scope, $state) {
    console.log('hitting this');

    $scope.classCategory = 'Live';
    $scope.changeClassCategory = function (category) {
        $scope.classCategory = category;
        $state.go('demo.' + category);
    };
});
app.config(function ($stateProvider) {

    $stateProvider.state('demo', {
        url: '/demo',
        templateUrl: 'js/demo/demo.html',
        controller: 'DemoController'
    });
});
app.config(function ($stateProvider) {
    $stateProvider.state('docs', {
        url: '/docs',
        templateUrl: 'js/docs/docs.html'
    });
});

(function () {

    'use strict';

    // Hope you didn't forget Angular! Duh-doy.

    if (!window.angular) throw new Error('I can\'t find Angular!');

    var app = angular.module('fsaPreBuilt', []);

    app.factory('Socket', function () {
        if (!window.io) throw new Error('socket.io not found!');
        return window.io(window.location.origin);
    });

    // AUTH_EVENTS is used throughout our app to
    // broadcast and listen from and to the $rootScope
    // for important events about authentication flow.
    app.constant('AUTH_EVENTS', {
        loginSuccess: 'auth-login-success',
        loginFailed: 'auth-login-failed',
        logoutSuccess: 'auth-logout-success',
        sessionTimeout: 'auth-session-timeout',
        notAuthenticated: 'auth-not-authenticated',
        notAuthorized: 'auth-not-authorized'
    });

    app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
        var statusDict = {
            401: AUTH_EVENTS.notAuthenticated,
            403: AUTH_EVENTS.notAuthorized,
            419: AUTH_EVENTS.sessionTimeout,
            440: AUTH_EVENTS.sessionTimeout
        };
        return {
            responseError: function responseError(response) {
                $rootScope.$broadcast(statusDict[response.status], response);
                return $q.reject(response);
            }
        };
    });

    app.config(function ($httpProvider) {
        $httpProvider.interceptors.push(['$injector', function ($injector) {
            return $injector.get('AuthInterceptor');
        }]);
    });

    app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q) {

        function onSuccessfulLogin(response) {
            var user = response.data.user;
            Session.create(user);
            $rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
            return user;
        }

        // Uses the session factory to see if an
        // authenticated user is currently registered.
        this.isAuthenticated = function () {
            return !!Session.user;
        };

        this.getLoggedInUser = function (fromServer) {

            // If an authenticated session exists, we
            // return the user attached to that session
            // with a promise. This ensures that we can
            // always interface with this method asynchronously.

            // Optionally, if true is given as the fromServer parameter,
            // then this cached value will not be used.

            if (this.isAuthenticated() && fromServer !== true) {
                return $q.when(Session.user);
            }

            // Make request GET /session.
            // If it returns a user, call onSuccessfulLogin with the response.
            // If it returns a 401 response, we catch it and instead resolve to null.
            return $http.get('/session').then(onSuccessfulLogin).catch(function () {
                return null;
            });
        };

        this.login = function (credentials) {
            return $http.post('/login', credentials).then(onSuccessfulLogin).catch(function () {
                return $q.reject({ message: 'Invalid login credentials.' });
            });
        };

        this.logout = function () {
            return $http.get('/logout').then(function () {
                Session.destroy();
                $rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
            });
        };
    });

    app.service('Session', function ($rootScope, AUTH_EVENTS) {

        var self = this;

        $rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
            self.destroy();
        });

        $rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
            self.destroy();
        });

        this.user = null;

        this.create = function (user) {
            this.user = user;
        };

        this.destroy = function () {
            this.user = null;
        };
    });
})();

app.controller('gridCtrl', function ($scope, $uibModal) {

    $scope.openModal = function () {
        $uibModal.open({
            templateUrl: 'js/grid/modalContent.html'
        });
    };
});

app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('landing', {
        url: '/',
        templateUrl: 'js/landing/landing.html'
    });
});
app.config(function ($stateProvider) {

    $stateProvider.state('login', {
        url: '/login',
        templateUrl: 'js/login/login.html',
        controller: 'LoginCtrl'
    });
});

app.controller('LoginCtrl', function ($scope, AuthService, $state) {

    $scope.login = {};
    $scope.error = null;

    $scope.sendLogin = function (loginInfo) {

        $scope.error = null;

        AuthService.login(loginInfo).then(function () {
            $state.go('home');
        }).catch(function () {
            $scope.error = 'Invalid login credentials.';
        });
    };
});

app.config(function ($stateProvider) {

    $stateProvider.state('membersOnly', {
        url: '/members-area',
        template: '<img ng-repeat="item in stash" width="300" ng-src="{{ item }}" />',
        controller: function controller($scope, SecretStash) {
            SecretStash.getStash().then(function (stash) {
                $scope.stash = stash;
            });
        },
        // The following data.authenticate is read by an event listener
        // that controls access to this state. Refer to app.js.
        data: {
            authenticate: true
        }
    });
});

app.factory('SecretStash', function ($http) {

    var getStash = function getStash() {
        return $http.get('/api/members/secret-stash').then(function (response) {
            return response.data;
        });
    };

    return {
        getStash: getStash
    };
});

app.factory('FullstackPics', function () {
    return ['https://pbs.twimg.com/media/B7gBXulCAAAXQcE.jpg:large', 'https://fbcdn-sphotos-c-a.akamaihd.net/hphotos-ak-xap1/t31.0-8/10862451_10205622990359241_8027168843312841137_o.jpg', 'https://pbs.twimg.com/media/B-LKUshIgAEy9SK.jpg', 'https://pbs.twimg.com/media/B79-X7oCMAAkw7y.jpg', 'https://pbs.twimg.com/media/B-Uj9COIIAIFAh0.jpg:large', 'https://pbs.twimg.com/media/B6yIyFiCEAAql12.jpg:large', 'https://pbs.twimg.com/media/CE-T75lWAAAmqqJ.jpg:large', 'https://pbs.twimg.com/media/CEvZAg-VAAAk932.jpg:large', 'https://pbs.twimg.com/media/CEgNMeOXIAIfDhK.jpg:large', 'https://pbs.twimg.com/media/CEQyIDNWgAAu60B.jpg:large', 'https://pbs.twimg.com/media/CCF3T5QW8AE2lGJ.jpg:large', 'https://pbs.twimg.com/media/CAeVw5SWoAAALsj.jpg:large', 'https://pbs.twimg.com/media/CAaJIP7UkAAlIGs.jpg:large', 'https://pbs.twimg.com/media/CAQOw9lWEAAY9Fl.jpg:large', 'https://pbs.twimg.com/media/B-OQbVrCMAANwIM.jpg:large', 'https://pbs.twimg.com/media/B9b_erwCYAAwRcJ.png:large', 'https://pbs.twimg.com/media/B5PTdvnCcAEAl4x.jpg:large', 'https://pbs.twimg.com/media/B4qwC0iCYAAlPGh.jpg:large', 'https://pbs.twimg.com/media/B2b33vRIUAA9o1D.jpg:large', 'https://pbs.twimg.com/media/BwpIwr1IUAAvO2_.jpg:large', 'https://pbs.twimg.com/media/BsSseANCYAEOhLw.jpg:large', 'https://pbs.twimg.com/media/CJ4vLfuUwAAda4L.jpg:large', 'https://pbs.twimg.com/media/CI7wzjEVEAAOPpS.jpg:large', 'https://pbs.twimg.com/media/CIdHvT2UsAAnnHV.jpg:large', 'https://pbs.twimg.com/media/CGCiP_YWYAAo75V.jpg:large', 'https://pbs.twimg.com/media/CIS4JPIWIAI37qu.jpg:large'];
});

app.factory('RandomGreetings', function () {

    var getRandomFromArray = function getRandomFromArray(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    };

    var greetings = ['Hello, world!', 'At long last, I live!', 'Hello, simple human.', 'What a beautiful day!', 'I\'m like any other project, except that I am yours. :)', 'This empty string is for Lindsay Levine.', 'こんにちは、ユーザー様。', 'Welcome. To. WEBSITE.', ':D', 'Yes, I think we\'ve met before.', 'Gimme 3 mins... I just grabbed this really dope frittata', 'If Cooper could offer only one piece of advice, it would be to nevSQUIRREL!'];

    return {
        greetings: greetings,
        getRandomGreeting: function getRandomGreeting() {
            return getRandomFromArray(greetings);
        }
    };
});

app.controller('DemandController', function ($scope, $state) {
    $scope.classes = classes;
    $scope.sortByType = function (type) {
        if (!type) $scope.classes = classes;else {
            $scope.classes = classes.filter(function (video) {
                return video.Type === type;
            });
        }
    };
});

var classes = [{
    "ID": 1,
    "Type": "Chair",
    "Title": "Aerobic Chair Video",
    "Youtube": "https://www.youtube.com/watch?v=m7zCDiiTBTk"
}, {
    "ID": 2,
    "Type": "Chair",
    "Title": "Priority One",
    "Youtube": "https://www.youtube.com/watch?v=OA55eMyB8S0"
}, {
    "ID": 3,
    "Type": "Chair",
    "Title": "Low Impact Chair Aerobics",
    "Youtube": "https://www.youtube.com/watch?v=2AuLqYh4irI"
}, {
    "ID": 4,
    "Type": "Chair",
    "Title": "Advanced Chair Exercise",
    "Youtube": "https://www.youtube.com/watch?v=OC9VbwyEG8U"
}, {
    "ID": 5,
    "Type": "Yoga",
    "Title": "Gentle Yoga",
    "Youtube": "https://www.youtube.com/watch?v=G8BsLlPE1m4"
}, {
    "ID": 6,
    "Type": "Yoga",
    "Title": "Gentle chair yoga routine",
    "Youtube": "https://www.youtube.com/watch?v=KEjiXtb2hRg"
}, {
    "ID": 7,
    "Type": "Yoga",
    "Title": "Wheelchair Yoga",
    "Youtube": "https://www.youtube.com/watch?v=FrVE1a2vgvA"
}, {
    "ID": 8,
    "Type": "Yoga",
    "Title": "Energizing Chair Yoga",
    "Youtube": "https://www.youtube.com/watch?v=k4ST1j9PfrA"
}, {
    "ID": 9,
    "Type": "Fall",
    "Title": "Balance Exercise",
    "Youtube": "https://www.youtube.com/watch?v=z-tUHuNPStw"
}, {
    "ID": 10,
    "Type": "Fall",
    "Title": "Fall Prevention Exercises",
    "Youtube": "https://www.youtube.com/watch?v=NJDAoBoldr4"
}, {
    "ID": 11,
    "Type": "Fall",
    "Title": "7 Balance Exercises",
    "Youtube": "https://www.youtube.com/watch?v=vGa5C1Qs8jA"
}, {
    "ID": 12,
    "Type": "Fall",
    "Title": "Postural Stability",
    "Youtube": "https://www.youtube.com/watch?v=z6JoaJgofT8"
}, {
    "ID": 13,
    "Type": "Tai Chi",
    "Title": "Easy Qigong",
    "Youtube": "https://www.youtube.com/watch?v=ApS1CLWO0BQ"
}, {
    "ID": 14,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Beginners",
    "Youtube": "https://www.youtube.com/watch?v=VSd-cmOEnmw"
}, {
    "ID": 15,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Seniors",
    "Youtube": "https://www.youtube.com/watch?v=WVKLJ8BuW8Q"
}, {
    "ID": 16,
    "Type": "Tai Chi",
    "Title": "Low Impact Tai Chi",
    "Youtube": "https://www.youtube.com/watch?v=ha1EF4YyvUw"
}];

app.config(function ($stateProvider) {

    $stateProvider.state('demo.On-Demand', {
        url: '/on-demand',
        templateUrl: 'js/demo/Demand/on-demand.html',
        controller: 'DemandController'
    });
});

app.config(function ($stateProvider) {

    $stateProvider.state('demo.Live', {
        url: '/live',
        templateUrl: 'js/demo/Live/liveClasses.html'
    });
});

app.directive('fullstackLogo', function () {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
    };
});

app.directive('randoGreeting', function (RandomGreetings) {

    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/rando-greeting/rando-greeting.html',
        link: function link(scope) {
            scope.greeting = RandomGreetings.getRandomGreeting();
        }
    };
});

app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

    return {
        restrict: 'E',
        scope: {},
        templateUrl: 'js/common/directives/navbar/navbar.html',
        link: function link(scope) {

            scope.items = [{ label: 'Home', state: 'home' }, { label: 'About', state: 'about' }, { label: 'Documentation', state: 'docs' }, { label: 'Members Only', state: 'membersOnly', auth: true }];

            scope.user = null;

            scope.isLoggedIn = function () {
                return AuthService.isAuthenticated();
            };

            scope.logout = function () {
                AuthService.logout().then(function () {
                    $state.go('home');
                });
            };

            var setUser = function setUser() {
                AuthService.getLoggedInUser().then(function (user) {
                    scope.user = user;
                });
            };

            var removeUser = function removeUser() {
                scope.user = null;
            };

            setUser();

            $rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
            $rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
            $rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);
        }

    };
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImRvY3MvZG9jcy5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibG9naW4vbG9naW4uanMiLCJtZW1iZXJzLW9ubHkvbWVtYmVycy1vbmx5LmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9GdWxsc3RhY2tQaWNzLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9SYW5kb21HcmVldGluZ3MuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuY3RybC5qcyIsImRlbW8vRGVtYW5kL2RlbWFuZC5zdGF0ZS5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5zdGF0ZS5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuanMiLCJjb21tb24vZGlyZWN0aXZlcy9uYXZiYXIvbmF2YmFyLmpzIl0sIm5hbWVzIjpbIndpbmRvdyIsImFwcCIsImFuZ3VsYXIiLCJtb2R1bGUiLCJjb25maWciLCIkdXJsUm91dGVyUHJvdmlkZXIiLCIkbG9jYXRpb25Qcm92aWRlciIsImh0bWw1TW9kZSIsIm90aGVyd2lzZSIsIndoZW4iLCJsb2NhdGlvbiIsInJlbG9hZCIsInJ1biIsIiRyb290U2NvcGUiLCIkd2luZG93IiwiJGxvY2F0aW9uIiwiZ2EiLCIkb24iLCJldmVudCIsInRvU3RhdGUiLCJ0b1BhcmFtcyIsImZyb21TdGF0ZSIsImZyb21QYXJhbXMiLCJ0aHJvd25FcnJvciIsImNvbnNvbGUiLCJpbmZvIiwiZXJyb3IiLCJwYXRoIiwiQXV0aFNlcnZpY2UiLCIkc3RhdGUiLCJkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoIiwic3RhdGUiLCJkYXRhIiwiYXV0aGVudGljYXRlIiwiaXNBdXRoZW50aWNhdGVkIiwicHJldmVudERlZmF1bHQiLCJnZXRMb2dnZWRJblVzZXIiLCJ0aGVuIiwidXNlciIsImdvIiwibmFtZSIsIiRzdGF0ZVByb3ZpZGVyIiwidXJsIiwiY29udHJvbGxlciIsInRlbXBsYXRlVXJsIiwiJHNjb3BlIiwiRnVsbHN0YWNrUGljcyIsImltYWdlcyIsIl8iLCJzaHVmZmxlIiwibG9nIiwiY2xhc3NDYXRlZ29yeSIsImNoYW5nZUNsYXNzQ2F0ZWdvcnkiLCJjYXRlZ29yeSIsIkVycm9yIiwiZmFjdG9yeSIsImlvIiwib3JpZ2luIiwiY29uc3RhbnQiLCJsb2dpblN1Y2Nlc3MiLCJsb2dpbkZhaWxlZCIsImxvZ291dFN1Y2Nlc3MiLCJzZXNzaW9uVGltZW91dCIsIm5vdEF1dGhlbnRpY2F0ZWQiLCJub3RBdXRob3JpemVkIiwiJHEiLCJBVVRIX0VWRU5UUyIsInN0YXR1c0RpY3QiLCJyZXNwb25zZUVycm9yIiwicmVzcG9uc2UiLCIkYnJvYWRjYXN0Iiwic3RhdHVzIiwicmVqZWN0IiwiJGh0dHBQcm92aWRlciIsImludGVyY2VwdG9ycyIsInB1c2giLCIkaW5qZWN0b3IiLCJnZXQiLCJzZXJ2aWNlIiwiJGh0dHAiLCJTZXNzaW9uIiwib25TdWNjZXNzZnVsTG9naW4iLCJjcmVhdGUiLCJmcm9tU2VydmVyIiwiY2F0Y2giLCJsb2dpbiIsImNyZWRlbnRpYWxzIiwicG9zdCIsIm1lc3NhZ2UiLCJsb2dvdXQiLCJkZXN0cm95Iiwic2VsZiIsIiR1aWJNb2RhbCIsIm9wZW5Nb2RhbCIsIm9wZW4iLCJzZW5kTG9naW4iLCJsb2dpbkluZm8iLCJ0ZW1wbGF0ZSIsIlNlY3JldFN0YXNoIiwiZ2V0U3Rhc2giLCJzdGFzaCIsImdldFJhbmRvbUZyb21BcnJheSIsImFyciIsIk1hdGgiLCJmbG9vciIsInJhbmRvbSIsImxlbmd0aCIsImdyZWV0aW5ncyIsImdldFJhbmRvbUdyZWV0aW5nIiwiY2xhc3NlcyIsInNvcnRCeVR5cGUiLCJ0eXBlIiwiZmlsdGVyIiwidmlkZW8iLCJUeXBlIiwiZGlyZWN0aXZlIiwicmVzdHJpY3QiLCJSYW5kb21HcmVldGluZ3MiLCJsaW5rIiwic2NvcGUiLCJncmVldGluZyIsIml0ZW1zIiwibGFiZWwiLCJhdXRoIiwiaXNMb2dnZWRJbiIsInNldFVzZXIiLCJyZW1vdmVVc2VyIl0sIm1hcHBpbmdzIjoiQUFBQTs7QUFDQUEsT0FBQUMsR0FBQSxHQUFBQyxRQUFBQyxNQUFBLENBQUEsWUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxjQUFBLEVBQUEsV0FBQSxDQUFBLENBQUE7O0FBRUFGLElBQUFHLE1BQUEsQ0FBQSxVQUFBQyxrQkFBQSxFQUFBQyxpQkFBQSxFQUFBO0FBQ0E7QUFDQUEsc0JBQUFDLFNBQUEsQ0FBQSxJQUFBO0FBQ0E7QUFDQUYsdUJBQUFHLFNBQUEsQ0FBQSxHQUFBO0FBQ0E7QUFDQUgsdUJBQUFJLElBQUEsQ0FBQSxpQkFBQSxFQUFBLFlBQUE7QUFDQVQsZUFBQVUsUUFBQSxDQUFBQyxNQUFBO0FBQ0EsS0FGQTtBQUdBLENBVEE7O0FBV0E7QUFDQVYsSUFBQVcsR0FBQSxDQUFBLFVBQUFDLFVBQUEsRUFBQUMsT0FBQSxFQUFBQyxTQUFBLEVBQUE7QUFDQUQsWUFBQUUsRUFBQSxDQUFBLFFBQUEsRUFBQSxlQUFBLEVBQUEsTUFBQTtBQUNBSCxlQUFBSSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBQyxLQUFBLEVBQUFDLE9BQUEsRUFBQUMsUUFBQSxFQUFBQyxTQUFBLEVBQUFDLFVBQUEsRUFBQUMsV0FBQSxFQUFBO0FBQ0FDLGdCQUFBQyxJQUFBLENBQUEsc0pBQUE7QUFDQUQsZ0JBQUFFLEtBQUEsQ0FBQUgsV0FBQTtBQUNBLEtBSEE7QUFJQVYsZUFBQUksR0FBQSxDQUFBLHFCQUFBLEVBQUEsVUFBQUMsS0FBQSxFQUFBQyxPQUFBLEVBQUFDLFFBQUEsRUFBQUMsU0FBQSxFQUFBO0FBQ0FQLGdCQUFBRSxFQUFBLENBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQUQsVUFBQVksSUFBQSxFQUFB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U0FBQUEsVUFBQSxHQUFBO0FBQ0FQLHNCQUFBakYsSUFBQSxHQUFBLElBQUE7QUFDQSxhQUZBOztBQUlBdUY7O0FBRUFoSCx1QkFBQUksR0FBQSxDQUFBaUQsWUFBQVAsWUFBQSxFQUFBa0UsT0FBQTtBQUNBaEgsdUJBQUFJLEdBQUEsQ0FBQWlELFlBQUFMLGFBQUEsRUFBQWlFLFVBQUE7QUFDQWpILHVCQUFBSSxHQUFBLENBQUFpRCxZQUFBSixjQUFBLEVBQUFnRSxVQUFBO0FBRUE7O0FBekNBLEtBQUE7QUE2Q0EsQ0EvQ0EiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnQ2FyZUZhckFwcCcsIFsnZnNhUHJlQnVpbHQnLCAndWkucm91dGVyJywgJ3VpLmJvb3RzdHJhcCcsICduZ0FuaW1hdGUnXSk7XG5cbmFwcC5jb25maWcoZnVuY3Rpb24gKCR1cmxSb3V0ZXJQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcbiAgICAvLyBUaGlzIHR1cm5zIG9mZiBoYXNoYmFuZyB1cmxzICgvI2Fib3V0KSBhbmQgY2hhbmdlcyBpdCB0byBzb21ldGhpbmcgbm9ybWFsICgvYWJvdXQpXG4gICAgJGxvY2F0aW9uUHJvdmlkZXIuaHRtbDVNb2RlKHRydWUpO1xuICAgIC8vIElmIHdlIGdvIHRvIGEgVVJMIHRoYXQgdWktcm91dGVyIGRvZXNuJ3QgaGF2ZSByZWdpc3RlcmVkLCBnbyB0byB0aGUgXCIvXCIgdXJsLlxuICAgICR1cmxSb3V0ZXJQcm92aWRlci5vdGhlcndpc2UoJy8nKTtcbiAgICAvLyBUcmlnZ2VyIHBhZ2UgcmVmcmVzaCB3aGVuIGFjY2Vzc2luZyBhbiBPQXV0aCByb3V0ZVxuICAgICR1cmxSb3V0ZXJQcm92aWRlci53aGVuKCcvYXV0aC86cHJvdmlkZXInLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9KTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGxpc3RlbmluZyB0byBlcnJvcnMgYnJvYWRjYXN0ZWQgYnkgdWktcm91dGVyLCB1c3VhbGx5IG9yaWdpbmF0aW5nIGZyb20gcmVzb2x2ZXNcbmFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUsICR3aW5kb3csICRsb2NhdGlvbikge1xuICAgICR3aW5kb3cuZ2EoJ2NyZWF0ZScsICdVQS04NTU1Njg0Ni0xJywgJ2F1dG8nKTtcbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlRXJyb3InLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUsIGZyb21QYXJhbXMsIHRocm93bkVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVGhlIGZvbGxvd2luZyBlcnJvciB3YXMgdGhyb3duIGJ5IHVpLXJvdXRlciB3aGlsZSB0cmFuc2l0aW9uaW5nIHRvIHN0YXRlIFwiJHt0b1N0YXRlLm5hbWV9XCIuIFRoZSBvcmlnaW4gb2YgdGhpcyBlcnJvciBpcyBwcm9iYWJseSBhIHJlc29sdmUgZnVuY3Rpb246Jyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IodGhyb3duRXJyb3IpO1xuICAgIH0pO1xuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlKSB7XG4gICAgICAgICR3aW5kb3cuZ2EoJ3NlbmQnLCAncGFnZXZpZXcnLCAkbG9jYXRpb24ucGF0aCgpKTtcbiAgICB9KTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGNvbnRyb2xsaW5nIGFjY2VzcyB0byBzcGVjaWZpYyBzdGF0ZXMuXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCAkd2luZG93LCAkbG9jYXRpb24pIHtcblxuICAgIC8vIFRoZSBnaXZlbiBzdGF0ZSByZXF1aXJlcyBhbiBhdXRoZW50aWNhdGVkIHVzZXIuXG4gICAgdmFyIGRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGggPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlLmRhdGEgJiYgc3RhdGUuZGF0YS5hdXRoZW50aWNhdGU7XG4gICAgfTtcblxuICAgIC8vICRzdGF0ZUNoYW5nZVN0YXJ0IGlzIGFuIGV2ZW50IGZpcmVkXG4gICAgLy8gd2hlbmV2ZXIgdGhlIHByb2Nlc3Mgb2YgY2hhbmdpbmcgYSBzdGF0ZSBiZWdpbnMuXG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcykge1xuXG4gICAgICAgICAkd2luZG93LmdhKCdzZW5kJywgJ3BhZ2V2aWV3Q2xpY2snLCAkbG9jYXRpb24ucGF0aCgpKTtcblxuICAgICAgICBpZiAoIWRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgodG9TdGF0ZSkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBkb2VzIG5vdCByZXF1aXJlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBpcyBhdXRoZW50aWNhdGVkLlxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbmNlbCBuYXZpZ2F0aW5nIHRvIG5ldyBzdGF0ZS5cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAvLyBJZiBhIHVzZXIgaXMgcmV0cmlldmVkLCB0aGVuIHJlbmF2aWdhdGUgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAgICAgICAgICAvLyAodGhlIHNlY29uZCB0aW1lLCBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSB3aWxsIHdvcmspXG4gICAgICAgICAgICAvLyBvdGhlcndpc2UsIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLCBnbyB0byBcImxvZ2luXCIgc3RhdGUuXG4gICAgICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbyh0b1N0YXRlLm5hbWUsIHRvUGFyYW1zKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdsb2dpbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH0pO1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAvLyBSZWdpc3RlciBvdXIgKmFib3V0KiBzdGF0ZS5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnYWJvdXQnLCB7XG4gICAgICAgIHVybDogJy9hYm91dCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdBYm91dENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2Fib3V0L2Fib3V0Lmh0bWwnXG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignQWJvdXRDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgRnVsbHN0YWNrUGljcykge1xuXG4gICAgLy8gSW1hZ2VzIG9mIGJlYXV0aWZ1bCBGdWxsc3RhY2sgcGVvcGxlLlxuICAgICRzY29wZS5pbWFnZXMgPSBfLnNodWZmbGUoRnVsbHN0YWNrUGljcyk7XG5cbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoJ0RlbW9Db250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdGNvbnNvbGUubG9nKCdoaXR0aW5nIHRoaXMnKVxuXHRcblx0JHNjb3BlLmNsYXNzQ2F0ZWdvcnkgPSAnTGl2ZSc7XG5cdCRzY29wZS5jaGFuZ2VDbGFzc0NhdGVnb3J5ID0gZnVuY3Rpb24gKGNhdGVnb3J5KSB7XG5cdFx0JHNjb3BlLmNsYXNzQ2F0ZWdvcnkgPSBjYXRlZ29yeTtcblx0XHQkc3RhdGUuZ28oJ2RlbW8uJytjYXRlZ29yeSlcblx0fVxufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8nLCB7XG4gICAgICAgIHVybDogJy9kZW1vJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL2RlbW8uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdEZW1vQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZG9jcycsIHtcbiAgICAgICAgdXJsOiAnL2RvY3MnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RvY3MvZG9jcy5odG1sJ1xuICAgIH0pO1xufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuXG4gICAgYXBwLnNlcnZpY2UoJ0F1dGhTZXJ2aWNlJywgZnVuY3Rpb24gKCRodHRwLCBTZXNzaW9uLCAkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUywgJHEpIHtcblxuICAgICAgICBmdW5jdGlvbiBvblN1Y2Nlc3NmdWxMb2dpbihyZXNwb25zZSkge1xuICAgICAgICAgICAgdmFyIHVzZXIgPSByZXNwb25zZS5kYXRhLnVzZXI7XG4gICAgICAgICAgICBTZXNzaW9uLmNyZWF0ZSh1c2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudXNlciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5jcmVhdGUgPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0oKSk7XG4iLCJcbmFwcC5jb250cm9sbGVyKCdncmlkQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsICR1aWJNb2RhbCkge1x0XG5cblx0JHNjb3BlLm9wZW5Nb2RhbCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkdWliTW9kYWwub3Blbih7XG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL2dyaWQvbW9kYWxDb250ZW50Lmh0bWwnXG5cdFx0fSlcblx0fVxufSlcblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgIC8vIFJlZ2lzdGVyIG91ciAqYWJvdXQqIHN0YXRlLlxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdsYW5kaW5nJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9sYW5kaW5nL2xhbmRpbmcuaHRtbCdcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdsb2dpbicsIHtcbiAgICAgICAgdXJsOiAnL2xvZ2luJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9sb2dpbi9sb2dpbi5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0xvZ2luQ3RybCdcbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdMb2dpbkN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cbiAgICAkc2NvcGUubG9naW4gPSB7fTtcbiAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuXG4gICAgJHNjb3BlLnNlbmRMb2dpbiA9IGZ1bmN0aW9uIChsb2dpbkluZm8pIHtcblxuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuXG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ2luKGxvZ2luSW5mbykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJztcbiAgICAgICAgfSk7XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbWVtYmVyc09ubHknLCB7XG4gICAgICAgIHVybDogJy9tZW1iZXJzLWFyZWEnLFxuICAgICAgICB0ZW1wbGF0ZTogJzxpbWcgbmctcmVwZWF0PVwiaXRlbSBpbiBzdGFzaFwiIHdpZHRoPVwiMzAwXCIgbmctc3JjPVwie3sgaXRlbSB9fVwiIC8+JyxcbiAgICAgICAgY29udHJvbGxlcjogZnVuY3Rpb24gKCRzY29wZSwgU2VjcmV0U3Rhc2gpIHtcbiAgICAgICAgICAgIFNlY3JldFN0YXNoLmdldFN0YXNoKCkudGhlbihmdW5jdGlvbiAoc3Rhc2gpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuc3Rhc2ggPSBzdGFzaDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGRhdGEuYXV0aGVudGljYXRlIGlzIHJlYWQgYnkgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgLy8gdGhhdCBjb250cm9scyBhY2Nlc3MgdG8gdGhpcyBzdGF0ZS4gUmVmZXIgdG8gYXBwLmpzLlxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuICAgIH0pO1xuXG59KTtcblxuYXBwLmZhY3RvcnkoJ1NlY3JldFN0YXNoJywgZnVuY3Rpb24gKCRodHRwKSB7XG5cbiAgICB2YXIgZ2V0U3Rhc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9hcGkvbWVtYmVycy9zZWNyZXQtc3Rhc2gnKS50aGVuKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmRhdGE7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXRTdGFzaDogZ2V0U3Rhc2hcbiAgICB9O1xuXG59KTtcbiIsImFwcC5mYWN0b3J5KCdGdWxsc3RhY2tQaWNzJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBbXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjdnQlh1bENBQUFYUWNFLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL2ZiY2RuLXNwaG90b3MtYy1hLmFrYW1haWhkLm5ldC9ocGhvdG9zLWFrLXhhcDEvdDMxLjAtOC8xMDg2MjQ1MV8xMDIwNTYyMjk5MDM1OTI0MV84MDI3MTY4ODQzMzEyODQxMTM3X28uanBnJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CLUxLVXNoSWdBRXk5U0suanBnJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CNzktWDdvQ01BQWt3N3kuanBnJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CLVVqOUNPSUlBSUZBaDAuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CNnlJeUZpQ0VBQXFsMTIuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DRS1UNzVsV0FBQW1xcUouanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DRXZaQWctVkFBQWs5MzIuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DRWdOTWVPWElBSWZEaEsuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DRVF5SUROV2dBQXU2MEIuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DQ0YzVDVRVzhBRTJsR0ouanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DQWVWdzVTV29BQUFMc2ouanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DQWFKSVA3VWtBQWxJR3MuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DQVFPdzlsV0VBQVk5RmwuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CLU9RYlZyQ01BQU53SU0uanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9COWJfZXJ3Q1lBQXdSY0oucG5nOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CNVBUZHZuQ2NBRUFsNHguanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CNHF3QzBpQ1lBQWxQR2guanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CMmIzM3ZSSVVBQTlvMUQuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9Cd3BJd3IxSVVBQXZPMl8uanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9Cc1NzZUFOQ1lBRU9oTHcuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DSjR2TGZ1VXdBQWRhNEwuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DSTd3empFVkVBQU9QcFMuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DSWRIdlQyVXNBQW5uSFYuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DR0NpUF9ZV1lBQW83NVYuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9DSVM0SlBJV0lBSTM3cXUuanBnOmxhcmdlJ1xuICAgIF07XG59KTtcbiIsImFwcC5mYWN0b3J5KCdSYW5kb21HcmVldGluZ3MnLCBmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgZ2V0UmFuZG9tRnJvbUFycmF5ID0gZnVuY3Rpb24gKGFycikge1xuICAgICAgICByZXR1cm4gYXJyW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGFyci5sZW5ndGgpXTtcbiAgICB9O1xuXG4gICAgdmFyIGdyZWV0aW5ncyA9IFtcbiAgICAgICAgJ0hlbGxvLCB3b3JsZCEnLFxuICAgICAgICAnQXQgbG9uZyBsYXN0LCBJIGxpdmUhJyxcbiAgICAgICAgJ0hlbGxvLCBzaW1wbGUgaHVtYW4uJyxcbiAgICAgICAgJ1doYXQgYSBiZWF1dGlmdWwgZGF5IScsXG4gICAgICAgICdJXFwnbSBsaWtlIGFueSBvdGhlciBwcm9qZWN0LCBleGNlcHQgdGhhdCBJIGFtIHlvdXJzLiA6KScsXG4gICAgICAgICdUaGlzIGVtcHR5IHN0cmluZyBpcyBmb3IgTGluZHNheSBMZXZpbmUuJyxcbiAgICAgICAgJ+OBk+OCk+OBq+OBoeOBr+OAgeODpuODvOOCtuODvOanmOOAgicsXG4gICAgICAgICdXZWxjb21lLiBUby4gV0VCU0lURS4nLFxuICAgICAgICAnOkQnLFxuICAgICAgICAnWWVzLCBJIHRoaW5rIHdlXFwndmUgbWV0IGJlZm9yZS4nLFxuICAgICAgICAnR2ltbWUgMyBtaW5zLi4uIEkganVzdCBncmFiYmVkIHRoaXMgcmVhbGx5IGRvcGUgZnJpdHRhdGEnLFxuICAgICAgICAnSWYgQ29vcGVyIGNvdWxkIG9mZmVyIG9ubHkgb25lIHBpZWNlIG9mIGFkdmljZSwgaXQgd291bGQgYmUgdG8gbmV2U1FVSVJSRUwhJyxcbiAgICBdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ3JlZXRpbmdzOiBncmVldGluZ3MsXG4gICAgICAgIGdldFJhbmRvbUdyZWV0aW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZ2V0UmFuZG9tRnJvbUFycmF5KGdyZWV0aW5ncyk7XG4gICAgICAgIH1cbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb250cm9sbGVyKCdEZW1hbmRDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdCRzY29wZS5jbGFzc2VzID0gY2xhc3NlcztcbiAgJHNjb3BlLnNvcnRCeVR5cGUgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIGlmKCF0eXBlKSAkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXM7XG4gICAgZWxzZSB7XG4gICAgICAkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXMuZmlsdGVyKGZ1bmN0aW9uICh2aWRlbykge1xuICAgICAgICByZXR1cm4gdmlkZW8uVHlwZSA9PT0gdHlwZVxuICAgICAgfSlcbiAgICAgIFxuICAgIH1cbiAgfVxufSlcblxudmFyIGNsYXNzZXMgPSBbXG4gIHtcbiAgICBcIklEXCI6IDEsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiQWVyb2JpYyBDaGFpciBWaWRlb1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9bTd6Q0RpaVRCVGtcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAyLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIlByaW9yaXR5IE9uZVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9T0E1NWVNeUI4UzBcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAzLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkxvdyBJbXBhY3QgQ2hhaXIgQWVyb2JpY3NcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTJBdUxxWWg0aXJJXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNCxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJBZHZhbmNlZCBDaGFpciBFeGVyY2lzZVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9T0M5VmJ3eUVHOFVcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA1LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiR2VudGxlIFlvZ2FcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUc4QnNMbFBFMW00XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNixcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkdlbnRsZSBjaGFpciB5b2dhIHJvdXRpbmVcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUtFamlYdGIyaFJnXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNyxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIldoZWVsY2hhaXIgWW9nYVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9RnJWRTFhMnZndkFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA4LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiRW5lcmdpemluZyBDaGFpciBZb2dhXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1rNFNUMWo5UGZyQVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDksXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJCYWxhbmNlIEV4ZXJjaXNlXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj16LXRVSHVOUFN0d1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEwLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiRmFsbCBQcmV2ZW50aW9uIEV4ZXJjaXNlc1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9TkpEQW9Cb2xkcjRcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMSxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIjcgQmFsYW5jZSBFeGVyY2lzZXNcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXZHYTVDMVFzOGpBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTIsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJQb3N0dXJhbCBTdGFiaWxpdHlcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXo2Sm9hSmdvZlQ4XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTMsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJFYXN5IFFpZ29uZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9QXBTMUNMV08wQlFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNCxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIlRhaSBDaGkgZm9yIEJlZ2lubmVyc1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9VlNkLWNtT0VubXdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNSxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIlRhaSBDaGkgZm9yIFNlbmlvcnNcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVdWS0xKOEJ1VzhRXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTYsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJMb3cgSW1wYWN0IFRhaSBDaGlcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWhhMUVGNFl5dlV3XCJcbiAgfVxuXTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5Pbi1EZW1hbmQnLCB7XG4gICAgICAgIHVybDogJy9vbi1kZW1hbmQnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRGVtYW5kL29uLWRlbWFuZC5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0RlbWFuZENvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5MaXZlJywge1xuICAgICAgICB1cmw6ICcvbGl2ZScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9MaXZlL2xpdmVDbGFzc2VzLmh0bWwnXG4gICAgfSk7XG5cbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgncmFuZG9HcmVldGluZycsIGZ1bmN0aW9uIChSYW5kb21HcmVldGluZ3MpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgICAgc2NvcGUuZ3JlZXRpbmcgPSBSYW5kb21HcmVldGluZ3MuZ2V0UmFuZG9tR3JlZXRpbmcoKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnbmF2YmFyJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge30sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdIb21lJywgc3RhdGU6ICdob21lJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdBYm91dCcsIHN0YXRlOiAnYWJvdXQnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ0RvY3VtZW50YXRpb24nLCBzdGF0ZTogJ2RvY3MnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ01lbWJlcnMgT25seScsIHN0YXRlOiAnbWVtYmVyc09ubHknLCBhdXRoOiB0cnVlIH1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuXG4gICAgICAgICAgICBzY29wZS5pc0xvZ2dlZEluID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5sb2dvdXQoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgcmVtb3ZlVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNldFVzZXIoKTtcblxuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzLCBzZXRVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MsIHJlbW92ZVVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIHJlbW92ZVVzZXIpO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIl19
