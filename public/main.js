'use strict';

window.app = angular.module('CareFarApp', ['fsaPreBuilt', 'ui.calendar', 'ui.router', 'ui.bootstrap', 'ngAnimate']);

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

    $scope.changeClassCategory = function (category) {
        $scope.classCategory = category;
        $state.go('demo.' + category);
    };

    $scope.changeClassCategory('Live');
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
app.controller('LiveController', function ($scope, $compile, uiCalendarConfig) {

    var date = new Date();
    var d = date.getDate();
    var m = date.getMonth();
    var y = date.getFullYear();

    $scope.changeTo = 'Hungarian';
    /* event source that pulls from google.com */
    $scope.eventSource = {
        url: "http://www.google.com/calendar/feeds/usa__en%40holiday.calendar.google.com/public/basic",
        className: 'gcal-event', // an option!
        currentTimezone: 'America/Chicago' // an option!
    };
    /* event source that contains custom events on the scope */
    $scope.events = [{ title: 'All Day Event', start: new Date(y, m, 1) }, { title: 'Long Event', start: new Date(y, m, d - 5), end: new Date(y, m, d - 2) }, { id: 999, title: 'Repeating Event', start: new Date(y, m, d - 3, 16, 0), allDay: false }, { id: 999, title: 'Repeating Event', start: new Date(y, m, d + 4, 16, 0), allDay: false }, { title: 'Birthday Party', start: new Date(y, m, d + 1, 19, 0), end: new Date(y, m, d + 1, 22, 30), allDay: false }, { title: 'Click for Google', start: new Date(y, m, 28), end: new Date(y, m, 29), url: 'http://google.com/' }];
    /* event source that calls a function on every view switch */
    $scope.eventsF = function (start, end, timezone, callback) {
        var s = new Date(start).getTime() / 1000;
        var e = new Date(end).getTime() / 1000;
        var m = new Date(start).getMonth();
        var events = [{ title: 'Feed Me ' + m, start: s + 50000, end: s + 100000, allDay: false, className: ['customFeed'] }];
        callback(events);
    };

    $scope.calEventsExt = {
        color: '#f00',
        textColor: 'yellow',
        events: [{ type: 'party', title: 'Lunch', start: new Date(y, m, d, 12, 0), end: new Date(y, m, d, 14, 0), allDay: false }, { type: 'party', title: 'Lunch 2', start: new Date(y, m, d, 12, 0), end: new Date(y, m, d, 14, 0), allDay: false }, { type: 'party', title: 'Click for Google', start: new Date(y, m, 28), end: new Date(y, m, 29), url: 'http://google.com/' }]
    };
    /* alert on eventClick */
    $scope.alertOnEventClick = function (date, jsEvent, view) {
        $scope.alertMessage = date.title + ' was clicked ';
    };
    /* alert on Drop */
    $scope.alertOnDrop = function (event, delta, revertFunc, jsEvent, ui, view) {
        $scope.alertMessage = 'Event Droped to make dayDelta ' + delta;
    };
    /* alert on Resize */
    $scope.alertOnResize = function (event, delta, revertFunc, jsEvent, ui, view) {
        $scope.alertMessage = 'Event Resized to make dayDelta ' + delta;
    };
    /* add and removes an event source of choice */
    $scope.addRemoveEventSource = function (sources, source) {
        var canAdd = 0;
        angular.forEach(sources, function (value, key) {
            if (sources[key] === source) {
                sources.splice(key, 1);
                canAdd = 1;
            }
        });
        if (canAdd === 0) {
            sources.push(source);
        }
    };
    /* add custom event*/
    $scope.addEvent = function () {
        $scope.events.push({
            title: 'Open Sesame',
            start: new Date(y, m, 28),
            end: new Date(y, m, 29),
            className: ['openSesame']
        });
    };
    /* remove event */
    $scope.remove = function (index) {
        $scope.events.splice(index, 1);
    };
    /* Change View */
    $scope.changeView = function (view, calendar) {
        uiCalendarConfig.calendars[calendar].fullCalendar('changeView', view);
    };
    /* Change View */
    $scope.renderCalender = function (calendar) {
        if (uiCalendarConfig.calendars[calendar]) {
            uiCalendarConfig.calendars[calendar].fullCalendar('render');
        }
    };
    /* Render Tooltip */
    $scope.eventRender = function (event, element, view) {
        element.attr({ 'tooltip': event.title,
            'tooltip-append-to-body': true });
        $compile(element)($scope);
    };
    /* config object */
    $scope.uiConfig = {
        calendar: {
            height: 450,
            editable: true,
            header: {
                left: 'title',
                center: '',
                right: 'today prev,next'
            },
            eventClick: $scope.alertOnEventClick,
            eventDrop: $scope.alertOnDrop,
            eventResize: $scope.alertOnResize,
            eventRender: $scope.eventRender
        }
    };

    $scope.changeLang = function () {
        if ($scope.changeTo === 'Hungarian') {
            $scope.uiConfig.calendar.dayNames = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
            $scope.uiConfig.calendar.dayNamesShort = ["Vas", "Hét", "Kedd", "Sze", "Csüt", "Pén", "Szo"];
            $scope.changeTo = 'English';
        } else {
            $scope.uiConfig.calendar.dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            $scope.uiConfig.calendar.dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            $scope.changeTo = 'Hungarian';
        }
    };
    /* event sources array*/
    $scope.eventSources = [$scope.events, $scope.eventSource, $scope.eventsF];
    $scope.eventSources2 = [$scope.calEventsExt, $scope.eventsF, $scope.events];

    $scope.changeClassCategory('Live');
});
app.config(function ($stateProvider) {

    $stateProvider.state('demo.Live', {
        url: '/live',
        templateUrl: 'js/demo/Live/liveClasses.html',
        controller: 'LiveController'
    });
});

app.directive('fullstackLogo', function () {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
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

app.directive('randoGreeting', function (RandomGreetings) {

    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/rando-greeting/rando-greeting.html',
        link: function link(scope) {
            scope.greeting = RandomGreetings.getRandomGreeting();
        }
    };
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImRvY3MvZG9jcy5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibG9naW4vbG9naW4uanMiLCJtZW1iZXJzLW9ubHkvbWVtYmVycy1vbmx5LmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9GdWxsc3RhY2tQaWNzLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9SYW5kb21HcmVldGluZ3MuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuY3RybC5qcyIsImRlbW8vRGVtYW5kL2RlbWFuZC5zdGF0ZS5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5jdHJsLmpzIiwiZGVtby9MaXZlL2xpdmVDbGFzc2VzLnN0YXRlLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uanMiLCJjb21tb24vZGlyZWN0aXZlcy9uYXZiYXIvbmF2YmFyLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuanMiXSwibmFtZXMiOlsid2luZG93IiwiYXBwIiwiYW5ndWxhciIsIm1vZHVsZSIsImNvbmZpZyIsIiR1cmxSb3V0ZXJQcm92aWRlciIsIiRsb2NhdGlvblByb3ZpZGVyIiwiaHRtbDVNb2RlIiwib3RoZXJ3aXNlIiwid2hlbiIsImxvY2F0aW9uIiwicmVsb2FkIiwicnVuIiwiJHJvb3RTY29wZSIsIiR3aW5kb3ciLCIkbG9jYXRpb24iLCJnYSIsIiRvbiIsImV2ZW50IiwidG9TdGF0ZSIsInRvUGFyYW1zIiwiZnJvbVN0YXRlIiwiZnJvbVBhcmFtcyIsInRocm93bkVycm9yIiwiY29uc29sZSIsImluZm8iLCJlcnJvciIsInBhdGgiLCJBdXRoU2VydmljZSIsIiRzdGF0ZSIsImRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgiLCJzdGF0ZSIsImRhdGEiLCJhdXRoZW50aWNhdGUiLCJpc0F1dGhlbnRpY2F0ZWQiLCJwcmV2ZW50RGVmYXVsdCIsImdldExvZ2dlZEluVXNlciIsInRoZW4iLCJ1c2VyIiwiZ28iLCJuYW1lIiwiJHN0YXRlUHJvdmlkZXIiLCJ1cmwiLCJjb250cm9sbGVyIiwidGVtcGxhdGVVcmwiLCIkc2NvcGUiLCJGdWxsc3RhY2tQaWNzIiwiaW1hZ2VzIiwiXyIsInNodWZmbGUiLCJjaGFuZ2VDbGFzc0NhdGVnb3J5IiwiY2F0ZWdvcnkiLCJjbGFzc0NhdGVnb3J5IiwiRXJyb3IiLCJmYWN0b3J5IiwiaW8iLCJvcmlnaW4iLCJjb25zdGFudCIsImxvZ2luU3VjY2VzcyIsImxvZ2luRmFpbGVkIiwibG9nb3V0U3VjY2VzcyIsInNlc3Npb25UaW1lb3V0Iiwibm90QXV0aGVudGljYXRlZCIsIm5vdEF1dGhvcml6ZWQiLCIkcSIsIkFVVEhfRVZFTlRTIiwic3RhdHVzRGljdCIsInJlc3BvbnNlRXJyb3IiLCJyZXNwb25zZSIsIiRicm9hZGNhc3QiLCJzdGF0dXMiLCJyZWplY3QiLCIkaHR0cFByb3ZpZGVyIiwiaW50ZXJjZXB0b3JzIiwicHVzaCIsIiRpbmplY3RvciIsImdldCIsInNlcnZpY2UiLCIkaHR0cCIsIlNlc3Npb24iLCJvblN1Y2Nlc3NmdWxMb2dpbiIsImNyZWF0ZSIsImZyb21TZXJ2ZXIiLCJjYXRjaCIsImxvZ2luIiwiY3JlZGVudGlhbHMiLCJwb3N0IiwibWVzc2FnZSIsImxvZ291dCIsImRlc3Ryb3kiLCJzZWxmIiwiJHVpYk1vZGFsIiwib3Blbk1vZGFsIiwib3BlbiIsInNlbmRMb2dpbiIsImxvZ2luSW5mbyIsInRlbXBsYXRlIiwiU2VjcmV0U3Rhc2giLCJnZXRTdGFzaCIsInN0YXNoIiwiZ2V0UmFuZG9tRnJvbUFycmF5IiwiYXJyIiwiTWF0aCIsImZsb29yIiwicmFuZG9tIiwibGVuZ3RoIiwiZ3JlZXRpbmdzIiwiZ2V0UmFuZG9tR3JlZXRpbmciLCJjbGFzc2VzIiwic29ydEJ5VHlwZSIsInR5cGUiLCJmaWx0ZXIiLCJ2aWRlbyIsIlR5cGUiLCIkY29tcGlsZSIsInVpQ2FsZW5kYXJDb25maWciLCJkYXRlIiwiRGF0ZSIsImQiLCJnZXREYXRlIiwibSIsImdldE1vbnRoIiwieSIsImdldEZ1bGxZZWFyIiwiY2hhbmdlVG8iLCJldmVudFNvdXJjZSIsImNsYXNzTmFtZSIsImN1cnJlbnRUaW1lem9uZSIsImV2ZW50cyIsInRpdGxlIiwic3RhcnQiLCJlbmQiLCJpZCIsImFsbERheSIsImV2ZW50c0YiLCJ0aW1lem9uZSIsImNhbGxiYWNrIiwicyIsImdldFRpbWUiLCJlIiwiY2FsRXZlbnRzRXh0IiwiY29sb3IiLCJ0ZXh0Q29sb3IiLCJhbGVydE9uRXZlbnRDbGljayIsImpzRXZlbnQiLCJ2aWV3IiwiYWxlcnRNZXNzYWdlIiwiYWxlcnRPbkRyb3AiLCJkZWx0YSIsInJldmVydEZ1bmMiLCJ1aSIsImFsZXJ0T25SZXNpemUiLCJhZGRSZW1vdmVFdmVudFNvdXJjZSIsInNvdXJjZXMiLCJzb3VyY2UiLCJjYW5BZGQiLCJmb3JFYWNoIiwidmFsdWUiLCJrZXkiLCJzcGxpY2UiLCJhZGRFdmVudCIsInJlbW92ZSIsImluZGV4IiwiY2hhbmdlVmlldyIsImNhbGVuZGFyIiwiY2FsZW5kYXJzIiwiZnVsbENhbGVuZGFyIiwicmVuZGVyQ2FsZW5kZXIiLCJldmVudFJlbmRlciIsImVsZW1lbnQiLCJhdHRyIiwidWlDb25maWciLCJoZWlnaHQiLCJlZGl0YWJsZSIsImhlYWRlciIsImxlZnQiLCJjZW50ZXIiLCJyaWdodCIsImV2ZW50Q2xpY2siLCJldmVudERyb3AiLCJldmVudFJlc2l6ZSIsImNoYW5nZUxhbmciLCJkYXlOYW1lcyIsImRheU5hbWVzU2hvcnQiLCJldmVudFNvdXJjZXMiLCJldmVudFNvdXJjZXMyIiwiZGlyZWN0aXZlIiwicmVzdHJpY3QiLCJzY29wZSIsImxpbmsiLCJpdGVtcyIsImxhYmVsIiwiYXV0aCIsImlzTG9nZ2VkSW4iLCJzZXRVc2VyIiwi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WUFBQU0sZUFBQSxFQUFBO0FBQ0EsYUFGQTs7QUFJQTBKLGtCQUFBcEcsTUFBQSxHQUFBLFlBQUE7QUFDQTVELDRCQUFBNEQsTUFBQSxHQUFBbkQsSUFBQSxDQUFBLFlBQUE7QUFDQVIsMkJBQUFVLEVBQUEsQ0FBQSxNQUFBO0FBQ0EsaUJBRkE7QUFHQSxhQUpBOztBQU1BLGdCQUFBMkosVUFBQSxTQUFBQSxPQUFBLEdBQUE7QUFDQXRLLDRCQUFBUSxlQUFBLEdBQUFDLElBQUEsQ0FBQSxVQUFBQyxJQUFBLEVBQUE7QUFDQXNKLDBCQUFBdEosSUFBQSxHQUFBQSxJQUFBO0FBQ0EsaUJBRkE7QUFHQSxhQUpBOztBQU1BLGdCQUFBNkosYUFBQSxTQUFBQSxVQUFBLEdBQUE7QUFDQVAsc0JBQUF0SixJQUFBLEdBQUEsSUFBQTtBQUNBLGFBRkE7O0FBSUE0Sjs7QUFFQXJMLHVCQUFBSSxHQUFBLENBQUFnRCxZQUFBUCxZQUFBLEVBQUF3SSxPQUFBO0FBQ0FyTCx1QkFBQUksR0FBQSxDQUFBZ0QsWUFBQUwsYUFBQSxFQUFBdUksVUFBQTtBQUNBdEwsdUJBQUFJLEdBQUEsQ0FBQWdELFlBQUFKLGNBQUEsRUFBQXNJLFVBQUE7QUFFQTs7QUF6Q0EsS0FBQTtBQTZDQSxDQS9DQTs7QUNBQWxNLElBQUF5TCxTQUFBLENBQUEsZUFBQSxFQUFBLFVBQUFVLGVBQUEsRUFBQTs7QUFFQSxXQUFBO0FBQ0FULGtCQUFBLEdBREE7QUFFQS9JLHFCQUFBLHlEQUZBO0FBR0FpSixjQUFBLGNBQUFELEtBQUEsRUFBQTtBQUNBQSxrQkFBQVMsUUFBQSxHQUFBRCxnQkFBQXpGLGlCQUFBLEVBQUE7QUFDQTtBQUxBLEtBQUE7QUFRQSxDQVZBIiwiZmlsZSI6Im1haW4uanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG53aW5kb3cuYXBwID0gYW5ndWxhci5tb2R1bGUoJ0NhcmVGYXJBcHAnLCBbJ2ZzYVByZUJ1aWx0JywndWkuY2FsZW5kYXInLCd1aS5yb3V0ZXInLCAndWkuYm9vdHN0cmFwJywgJ25nQW5pbWF0ZSddKTtcblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHVybFJvdXRlclByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlcikge1xuICAgIC8vIFRoaXMgdHVybnMgb2ZmIGhhc2hiYW5nIHVybHMgKC8jYWJvdXQpIGFuZCBjaGFuZ2VzIGl0IHRvIHNvbWV0aGluZyBub3JtYWwgKC9hYm91dClcbiAgICAkbG9jYXRpb25Qcm92aWRlci5odG1sNU1vZGUodHJ1ZSk7XG4gICAgLy8gSWYgd2UgZ28gdG8gYSBVUkwgdGhhdCB1aS1yb3V0ZXIgZG9lc24ndCBoYXZlIHJlZ2lzdGVyZWQsIGdvIHRvIHRoZSBcIi9cIiB1cmwuXG4gICAgJHVybFJvdXRlclByb3ZpZGVyLm90aGVyd2lzZSgnLycpO1xuICAgIC8vIFRyaWdnZXIgcGFnZSByZWZyZXNoIHdoZW4gYWNjZXNzaW5nIGFuIE9BdXRoIHJvdXRlXG4gICAgJHVybFJvdXRlclByb3ZpZGVyLndoZW4oJy9hdXRoLzpwcm92aWRlcicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0pO1xufSk7XG5cbi8vIFRoaXMgYXBwLnJ1biBpcyBmb3IgbGlzdGVuaW5nIHRvIGVycm9ycyBicm9hZGNhc3RlZCBieSB1aS1yb3V0ZXIsIHVzdWFsbHkgb3JpZ2luYXRpbmcgZnJvbSByZXNvbHZlc1xuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHdpbmRvdywgJGxvY2F0aW9uKSB7XG4gICAgJHdpbmRvdy5nYSgnY3JlYXRlJywgJ1VBLTg1NTU2ODQ2LTEnLCAnYXV0bycpO1xuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VFcnJvcicsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSwgZnJvbVBhcmFtcywgdGhyb3duRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5pbmZvKCdUaGUgZm9sbG93aW5nIGVycm9yIHdhcyB0aHJvd24gYnkgdWktcm91dGVyIHdoaWxlIHRyYW5zaXRpb25pbmcgdG8gc3RhdGUgXCIke3RvU3RhdGUubmFtZX1cIi4gVGhlIG9yaWdpbiBvZiB0aGlzIGVycm9yIGlzIHByb2JhYmx5IGEgcmVzb2x2ZSBmdW5jdGlvbjonKTtcbiAgICAgICAgY29uc29sZS5lcnJvcih0aHJvd25FcnJvcik7XG4gICAgfSk7XG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN1Y2Nlc3MnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUpIHtcbiAgICAgICAgJHdpbmRvdy5nYSgnc2VuZCcsICdwYWdldmlldycsICRsb2NhdGlvbi5wYXRoKCkpO1xuICAgIH0pO1xufSk7XG5cbi8vIFRoaXMgYXBwLnJ1biBpcyBmb3IgY29udHJvbGxpbmcgYWNjZXNzIHRvIHNwZWNpZmljIHN0YXRlcy5cbmFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUsICR3aW5kb3csICRsb2NhdGlvbikge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgICR3aW5kb3cuZ2EoJ3NlbmQnLCAncGFnZXZpZXdDbGljaycsICRsb2NhdGlvbi5wYXRoKCkpO1xuXG4gICAgICAgIGlmICghZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCh0b1N0YXRlKSkge1xuICAgICAgICAgICAgLy8gVGhlIGRlc3RpbmF0aW9uIHN0YXRlIGRvZXMgbm90IHJlcXVpcmUgYXV0aGVudGljYXRpb25cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkpIHtcbiAgICAgICAgICAgIC8vIFRoZSB1c2VyIGlzIGF1dGhlbnRpY2F0ZWQuXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FuY2VsIG5hdmlnYXRpbmcgdG8gbmV3IHN0YXRlLlxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIC8vIElmIGEgdXNlciBpcyByZXRyaWV2ZWQsIHRoZW4gcmVuYXZpZ2F0ZSB0byB0aGUgZGVzdGluYXRpb25cbiAgICAgICAgICAgIC8vICh0aGUgc2Vjb25kIHRpbWUsIEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpIHdpbGwgd29yaylcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgaWYgbm8gdXNlciBpcyBsb2dnZWQgaW4sIGdvIHRvIFwibG9naW5cIiBzdGF0ZS5cbiAgICAgICAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKHRvU3RhdGUubmFtZSwgdG9QYXJhbXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2xvZ2luJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgfSk7XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgIC8vIFJlZ2lzdGVyIG91ciAqYWJvdXQqIHN0YXRlLlxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdhYm91dCcsIHtcbiAgICAgICAgdXJsOiAnL2Fib3V0JyxcbiAgICAgICAgY29udHJvbGxlcjogJ0Fib3V0Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvYWJvdXQvYWJvdXQuaHRtbCdcbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdBYm91dENvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCBGdWxsc3RhY2tQaWNzKSB7XG5cbiAgICAvLyBJbWFnZXMgb2YgYmVhdXRpZnVsIEZ1bGxzdGFjayBwZW9wbGUuXG4gICAgJHNjb3BlLmltYWdlcyA9IF8uc2h1ZmZsZShGdWxsc3RhY2tQaWNzKTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignRGVtb0NvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0XG5cdCRzY29wZS5jaGFuZ2VDbGFzc0NhdGVnb3J5ID0gZnVuY3Rpb24gKGNhdGVnb3J5KSB7XG5cdFx0JHNjb3BlLmNsYXNzQ2F0ZWdvcnkgPSBjYXRlZ29yeTtcblx0XHQkc3RhdGUuZ28oJ2RlbW8uJytjYXRlZ29yeSlcblx0fVxuXG5cdCRzY29wZS5jaGFuZ2VDbGFzc0NhdGVnb3J5KCdMaXZlJyk7XG59KSIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtbycsIHtcbiAgICAgICAgdXJsOiAnL2RlbW8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vZGVtby5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0RlbW9Db250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkb2NzJywge1xuICAgICAgICB1cmw6ICcvZG9jcycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZG9jcy9kb2NzLmh0bWwnXG4gICAgfSk7XG59KTtcbiIsIihmdW5jdGlvbiAoKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBIb3BlIHlvdSBkaWRuJ3QgZm9yZ2V0IEFuZ3VsYXIhIER1aC1kb3kuXG4gICAgaWYgKCF3aW5kb3cuYW5ndWxhcikgdGhyb3cgbmV3IEVycm9yKCdJIGNhblxcJ3QgZmluZCBBbmd1bGFyIScpO1xuXG4gICAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdmc2FQcmVCdWlsdCcsIFtdKTtcblxuICAgIGFwcC5mYWN0b3J5KCdTb2NrZXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghd2luZG93LmlvKSB0aHJvdyBuZXcgRXJyb3IoJ3NvY2tldC5pbyBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuaW8od2luZG93LmxvY2F0aW9uLm9yaWdpbik7XG4gICAgfSk7XG5cbiAgICAvLyBBVVRIX0VWRU5UUyBpcyB1c2VkIHRocm91Z2hvdXQgb3VyIGFwcCB0b1xuICAgIC8vIGJyb2FkY2FzdCBhbmQgbGlzdGVuIGZyb20gYW5kIHRvIHRoZSAkcm9vdFNjb3BlXG4gICAgLy8gZm9yIGltcG9ydGFudCBldmVudHMgYWJvdXQgYXV0aGVudGljYXRpb24gZmxvdy5cbiAgICBhcHAuY29uc3RhbnQoJ0FVVEhfRVZFTlRTJywge1xuICAgICAgICBsb2dpblN1Y2Nlc3M6ICdhdXRoLWxvZ2luLXN1Y2Nlc3MnLFxuICAgICAgICBsb2dpbkZhaWxlZDogJ2F1dGgtbG9naW4tZmFpbGVkJyxcbiAgICAgICAgbG9nb3V0U3VjY2VzczogJ2F1dGgtbG9nb3V0LXN1Y2Nlc3MnLFxuICAgICAgICBzZXNzaW9uVGltZW91dDogJ2F1dGgtc2Vzc2lvbi10aW1lb3V0JyxcbiAgICAgICAgbm90QXV0aGVudGljYXRlZDogJ2F1dGgtbm90LWF1dGhlbnRpY2F0ZWQnLFxuICAgICAgICBub3RBdXRob3JpemVkOiAnYXV0aC1ub3QtYXV0aG9yaXplZCdcbiAgICB9KTtcblxuICAgIGFwcC5mYWN0b3J5KCdBdXRoSW50ZXJjZXB0b3InLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsIEFVVEhfRVZFTlRTKSB7XG4gICAgICAgIHZhciBzdGF0dXNEaWN0ID0ge1xuICAgICAgICAgICAgNDAxOiBBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLFxuICAgICAgICAgICAgNDAzOiBBVVRIX0VWRU5UUy5ub3RBdXRob3JpemVkLFxuICAgICAgICAgICAgNDE5OiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCxcbiAgICAgICAgICAgIDQ0MDogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0dXNEaWN0W3Jlc3BvbnNlLnN0YXR1c10sIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHJlc3BvbnNlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgYXBwLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlcikge1xuICAgICAgICAkaHR0cFByb3ZpZGVyLmludGVyY2VwdG9ycy5wdXNoKFtcbiAgICAgICAgICAgICckaW5qZWN0b3InLFxuICAgICAgICAgICAgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiAkaW5qZWN0b3IuZ2V0KCdBdXRoSW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSk7XG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnQXV0aFNlcnZpY2UnLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24sICRyb290U2NvcGUsIEFVVEhfRVZFTlRTLCAkcSkge1xuXG4gICAgICAgIGZ1bmN0aW9uIG9uU3VjY2Vzc2Z1bExvZ2luKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICB2YXIgdXNlciA9IHJlc3BvbnNlLmRhdGEudXNlcjtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKHVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcyk7XG4gICAgICAgICAgICByZXR1cm4gdXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZXMgdGhlIHNlc3Npb24gZmFjdG9yeSB0byBzZWUgaWYgYW5cbiAgICAgICAgLy8gYXV0aGVudGljYXRlZCB1c2VyIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLlxuICAgICAgICB0aGlzLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIVNlc3Npb24udXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmdldExvZ2dlZEluVXNlciA9IGZ1bmN0aW9uIChmcm9tU2VydmVyKSB7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBleGlzdHMsIHdlXG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIHVzZXIgYXR0YWNoZWQgdG8gdGhhdCBzZXNzaW9uXG4gICAgICAgICAgICAvLyB3aXRoIGEgcHJvbWlzZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuXG4gICAgICAgICAgICAvLyBhbHdheXMgaW50ZXJmYWNlIHdpdGggdGhpcyBtZXRob2QgYXN5bmNocm9ub3VzbHkuXG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHksIGlmIHRydWUgaXMgZ2l2ZW4gYXMgdGhlIGZyb21TZXJ2ZXIgcGFyYW1ldGVyLFxuICAgICAgICAgICAgLy8gdGhlbiB0aGlzIGNhY2hlZCB2YWx1ZSB3aWxsIG5vdCBiZSB1c2VkLlxuXG4gICAgICAgICAgICBpZiAodGhpcy5pc0F1dGhlbnRpY2F0ZWQoKSAmJiBmcm9tU2VydmVyICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLndoZW4oU2Vzc2lvbi51c2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWFrZSByZXF1ZXN0IEdFVCAvc2Vzc2lvbi5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSB1c2VyLCBjYWxsIG9uU3VjY2Vzc2Z1bExvZ2luIHdpdGggdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIDQwMSByZXNwb25zZSwgd2UgY2F0Y2ggaXQgYW5kIGluc3RlYWQgcmVzb2x2ZSB0byBudWxsLlxuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL3Nlc3Npb24nKS50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9naW4gPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9sb2dvdXQnKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBTZXNzaW9uLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9nb3V0U3VjY2Vzcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG4gICAgYXBwLnNlcnZpY2UoJ1Nlc3Npb24nLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMpIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IG51bGw7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxufSgpKTtcbiIsIlxuYXBwLmNvbnRyb2xsZXIoJ2dyaWRDdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgJHVpYk1vZGFsKSB7XHRcblxuXHQkc2NvcGUub3Blbk1vZGFsID0gZnVuY3Rpb24gKCkge1xuXHRcdCR1aWJNb2RhbC5vcGVuKHtcblx0XHRcdHRlbXBsYXRlVXJsOiAnanMvZ3JpZC9tb2RhbENvbnRlbnQuaHRtbCdcblx0XHR9KVxuXHR9XG59KVxuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgLy8gUmVnaXN0ZXIgb3VyICphYm91dCogc3RhdGUuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2xhbmRpbmcnLCB7XG4gICAgICAgIHVybDogJy8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2xhbmRpbmcvbGFuZGluZy5odG1sJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2xvZ2luJywge1xuICAgICAgICB1cmw6ICcvbG9naW4nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2xvZ2luL2xvZ2luLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnTG9naW5DdHJsJ1xuICAgIH0pO1xuXG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0xvZ2luQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUpIHtcblxuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAkc2NvcGUuc2VuZExvZ2luID0gZnVuY3Rpb24gKGxvZ2luSW5mbykge1xuXG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UubG9naW4obG9naW5JbmZvKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnaG9tZScpO1xuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSAnSW52YWxpZCBsb2dpbiBjcmVkZW50aWFscy4nO1xuICAgICAgICB9KTtcblxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdtZW1iZXJzT25seScsIHtcbiAgICAgICAgdXJsOiAnL21lbWJlcnMtYXJlYScsXG4gICAgICAgIHRlbXBsYXRlOiAnPGltZyBuZy1yZXBlYXQ9XCJpdGVtIGluIHN0YXNoXCIgd2lkdGg9XCIzMDBcIiBuZy1zcmM9XCJ7eyBpdGVtIH19XCIgLz4nLFxuICAgICAgICBjb250cm9sbGVyOiBmdW5jdGlvbiAoJHNjb3BlLCBTZWNyZXRTdGFzaCkge1xuICAgICAgICAgICAgU2VjcmV0U3Rhc2guZ2V0U3Rhc2goKS50aGVuKGZ1bmN0aW9uIChzdGFzaCkge1xuICAgICAgICAgICAgICAgICRzY29wZS5zdGFzaCA9IHN0YXNoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgZGF0YS5hdXRoZW50aWNhdGUgaXMgcmVhZCBieSBhbiBldmVudCBsaXN0ZW5lclxuICAgICAgICAvLyB0aGF0IGNvbnRyb2xzIGFjY2VzcyB0byB0aGlzIHN0YXRlLiBSZWZlciB0byBhcHAuanMuXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuZmFjdG9yeSgnU2VjcmV0U3Rhc2gnLCBmdW5jdGlvbiAoJGh0dHApIHtcblxuICAgIHZhciBnZXRTdGFzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2FwaS9tZW1iZXJzL3NlY3JldC1zdGFzaCcpLnRoZW4oZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldFN0YXNoOiBnZXRTdGFzaFxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmZhY3RvcnkoJ0Z1bGxzdGFja1BpY3MnLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CN2dCWHVsQ0FBQVhRY0UuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vZmJjZG4tc3Bob3Rvcy1jLWEuYWthbWFpaGQubmV0L2hwaG90b3MtYWsteGFwMS90MzEuMC04LzEwODYyNDUxXzEwMjA1NjIyOTkwMzU5MjQxXzgwMjcxNjg4NDMzMTI4NDExMzdfby5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItTEtVc2hJZ0FFeTlTSy5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I3OS1YN29DTUFBa3c3eS5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItVWo5Q09JSUFJRkFoMC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I2eUl5RmlDRUFBcWwxMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFLVQ3NWxXQUFBbXFxSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFdlpBZy1WQUFBazkzMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFZ05NZU9YSUFJZkRoSy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFUXlJRE5XZ0FBdTYwQi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NDRjNUNVFXOEFFMmxHSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBZVZ3NVNXb0FBQUxzai5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBYUpJUDdVa0FBbElHcy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBUU93OWxXRUFBWTlGbC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItT1FiVnJDTUFBTndJTS5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I5Yl9lcndDWUFBd1JjSi5wbmc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I1UFRkdm5DY0FFQWw0eC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I0cXdDMGlDWUFBbFBHaC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0IyYjMzdlJJVUFBOW8xRC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0J3cEl3cjFJVUFBdk8yXy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0JzU3NlQU5DWUFFT2hMdy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NKNHZMZnVVd0FBZGE0TC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJN3d6akVWRUFBT1BwUy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJZEh2VDJVc0FBbm5IVi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NHQ2lQX1lXWUFBbzc1Vi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJUzRKUElXSUFJMzdxdS5qcGc6bGFyZ2UnXG4gICAgXTtcbn0pO1xuIiwiYXBwLmZhY3RvcnkoJ1JhbmRvbUdyZWV0aW5ncycsIGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBnZXRSYW5kb21Gcm9tQXJyYXkgPSBmdW5jdGlvbiAoYXJyKSB7XG4gICAgICAgIHJldHVybiBhcnJbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXJyLmxlbmd0aCldO1xuICAgIH07XG5cbiAgICB2YXIgZ3JlZXRpbmdzID0gW1xuICAgICAgICAnSGVsbG8sIHdvcmxkIScsXG4gICAgICAgICdBdCBsb25nIGxhc3QsIEkgbGl2ZSEnLFxuICAgICAgICAnSGVsbG8sIHNpbXBsZSBodW1hbi4nLFxuICAgICAgICAnV2hhdCBhIGJlYXV0aWZ1bCBkYXkhJyxcbiAgICAgICAgJ0lcXCdtIGxpa2UgYW55IG90aGVyIHByb2plY3QsIGV4Y2VwdCB0aGF0IEkgYW0geW91cnMuIDopJyxcbiAgICAgICAgJ1RoaXMgZW1wdHkgc3RyaW5nIGlzIGZvciBMaW5kc2F5IExldmluZS4nLFxuICAgICAgICAn44GT44KT44Gr44Gh44Gv44CB44Om44O844K244O85qeY44CCJyxcbiAgICAgICAgJ1dlbGNvbWUuIFRvLiBXRUJTSVRFLicsXG4gICAgICAgICc6RCcsXG4gICAgICAgICdZZXMsIEkgdGhpbmsgd2VcXCd2ZSBtZXQgYmVmb3JlLicsXG4gICAgICAgICdHaW1tZSAzIG1pbnMuLi4gSSBqdXN0IGdyYWJiZWQgdGhpcyByZWFsbHkgZG9wZSBmcml0dGF0YScsXG4gICAgICAgICdJZiBDb29wZXIgY291bGQgb2ZmZXIgb25seSBvbmUgcGllY2Ugb2YgYWR2aWNlLCBpdCB3b3VsZCBiZSB0byBuZXZTUVVJUlJFTCEnLFxuICAgIF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBncmVldGluZ3M6IGdyZWV0aW5ncyxcbiAgICAgICAgZ2V0UmFuZG9tR3JlZXRpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRSYW5kb21Gcm9tQXJyYXkoZ3JlZXRpbmdzKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoJ0RlbWFuZENvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzO1xuICAkc2NvcGUuc29ydEJ5VHlwZSA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgaWYoIXR5cGUpICRzY29wZS5jbGFzc2VzID0gY2xhc3NlcztcbiAgICBlbHNlIHtcbiAgICAgICRzY29wZS5jbGFzc2VzID0gY2xhc3Nlcy5maWx0ZXIoZnVuY3Rpb24gKHZpZGVvKSB7XG4gICAgICAgIHJldHVybiB2aWRlby5UeXBlID09PSB0eXBlXG4gICAgICB9KVxuICAgICAgXG4gICAgfVxuICB9XG59KVxuXG52YXIgY2xhc3NlcyA9IFtcbiAge1xuICAgIFwiSURcIjogMSxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJBZXJvYmljIENoYWlyIFZpZGVvXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1tN3pDRGlpVEJUa1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDIsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiUHJpb3JpdHkgT25lXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1PQTU1ZU15QjhTMFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDMsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiTG93IEltcGFjdCBDaGFpciBBZXJvYmljc1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9MkF1THFZaDRpcklcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA0LFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkFkdmFuY2VkIENoYWlyIEV4ZXJjaXNlXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1PQzlWYnd5RUc4VVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDUsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJHZW50bGUgWW9nYVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9RzhCc0xsUEUxbTRcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA2LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiR2VudGxlIGNoYWlyIHlvZ2Egcm91dGluZVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9S0VqaVh0YjJoUmdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA3LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiV2hlZWxjaGFpciBZb2dhXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1GclZFMWEydmd2QVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDgsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJFbmVyZ2l6aW5nIENoYWlyIFlvZ2FcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWs0U1QxajlQZnJBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogOSxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIkJhbGFuY2UgRXhlcmNpc2VcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXotdFVIdU5QU3R3XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTAsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJGYWxsIFByZXZlbnRpb24gRXhlcmNpc2VzXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1OSkRBb0JvbGRyNFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDExLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiNyBCYWxhbmNlIEV4ZXJjaXNlc1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9dkdhNUMxUXM4akFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMixcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIlBvc3R1cmFsIFN0YWJpbGl0eVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9ejZKb2FKZ29mVDhcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMyxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIkVhc3kgUWlnb25nXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1BcFMxQ0xXTzBCUVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE0LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiVGFpIENoaSBmb3IgQmVnaW5uZXJzXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1WU2QtY21PRW5td1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE1LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiVGFpIENoaSBmb3IgU2VuaW9yc1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9V1ZLTEo4QnVXOFFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNixcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIkxvdyBJbXBhY3QgVGFpIENoaVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9aGExRUY0WXl2VXdcIlxuICB9XG5dO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLk9uLURlbWFuZCcsIHtcbiAgICAgICAgdXJsOiAnL29uLWRlbWFuZCcsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9EZW1hbmQvb24tZGVtYW5kLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRGVtYW5kQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ0xpdmVDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJGNvbXBpbGUsIHVpQ2FsZW5kYXJDb25maWcpIHtcblx0XG5cdHZhciBkYXRlID0gbmV3IERhdGUoKTtcbiAgICB2YXIgZCA9IGRhdGUuZ2V0RGF0ZSgpO1xuICAgIHZhciBtID0gZGF0ZS5nZXRNb250aCgpO1xuICAgIHZhciB5ID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuICAgIFxuICAgICRzY29wZS5jaGFuZ2VUbyA9ICdIdW5nYXJpYW4nO1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IHB1bGxzIGZyb20gZ29vZ2xlLmNvbSAqL1xuICAgICRzY29wZS5ldmVudFNvdXJjZSA9IHtcbiAgICAgICAgICAgIHVybDogXCJodHRwOi8vd3d3Lmdvb2dsZS5jb20vY2FsZW5kYXIvZmVlZHMvdXNhX19lbiU0MGhvbGlkYXkuY2FsZW5kYXIuZ29vZ2xlLmNvbS9wdWJsaWMvYmFzaWNcIixcbiAgICAgICAgICAgIGNsYXNzTmFtZTogJ2djYWwtZXZlbnQnLCAgICAgICAgICAgLy8gYW4gb3B0aW9uIVxuICAgICAgICAgICAgY3VycmVudFRpbWV6b25lOiAnQW1lcmljYS9DaGljYWdvJyAvLyBhbiBvcHRpb24hXG4gICAgfTtcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBjb250YWlucyBjdXN0b20gZXZlbnRzIG9uIHRoZSBzY29wZSAqL1xuICAgICRzY29wZS5ldmVudHMgPSBbXG5cdFx0XHQgICAgICB7dGl0bGU6ICdBbGwgRGF5IEV2ZW50JyxzdGFydDogbmV3IERhdGUoeSwgbSwgMSl9LFxuXHRcdFx0ICAgICAge3RpdGxlOiAnTG9uZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgLSA1KSxlbmQ6IG5ldyBEYXRlKHksIG0sIGQgLSAyKX0sXG5cdFx0XHQgICAgICB7aWQ6IDk5OSx0aXRsZTogJ1JlcGVhdGluZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgLSAzLCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7aWQ6IDk5OSx0aXRsZTogJ1JlcGVhdGluZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgKyA0LCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdCaXJ0aGRheSBQYXJ0eScsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgKyAxLCAxOSwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkICsgMSwgMjIsIDMwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICAgIHt0aXRsZTogJ0NsaWNrIGZvciBHb29nbGUnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksdXJsOiAnaHR0cDovL2dvb2dsZS5jb20vJ31cblx0XHRcdCAgICBdO1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IGNhbGxzIGEgZnVuY3Rpb24gb24gZXZlcnkgdmlldyBzd2l0Y2ggKi9cbiAgICAkc2NvcGUuZXZlbnRzRiA9IGZ1bmN0aW9uIChzdGFydCwgZW5kLCB0aW1lem9uZSwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBzID0gbmV3IERhdGUoc3RhcnQpLmdldFRpbWUoKSAvIDEwMDA7XG4gICAgICB2YXIgZSA9IG5ldyBEYXRlKGVuZCkuZ2V0VGltZSgpIC8gMTAwMDtcbiAgICAgIHZhciBtID0gbmV3IERhdGUoc3RhcnQpLmdldE1vbnRoKCk7XG4gICAgICB2YXIgZXZlbnRzID0gW3t0aXRsZTogJ0ZlZWQgTWUgJyArIG0sc3RhcnQ6IHMgKyAoNTAwMDApLGVuZDogcyArICgxMDAwMDApLGFsbERheTogZmFsc2UsIGNsYXNzTmFtZTogWydjdXN0b21GZWVkJ119XTtcbiAgICAgIGNhbGxiYWNrKGV2ZW50cyk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYWxFdmVudHNFeHQgPSB7XG4gICAgICAgY29sb3I6ICcjZjAwJyxcbiAgICAgICB0ZXh0Q29sb3I6ICd5ZWxsb3cnLFxuICAgICAgIGV2ZW50czogWyBcbiAgICAgICAgICB7dHlwZToncGFydHknLHRpdGxlOiAnTHVuY2gnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0x1bmNoIDInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0NsaWNrIGZvciBHb29nbGUnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksdXJsOiAnaHR0cDovL2dvb2dsZS5jb20vJ31cbiAgICAgICAgXVxuICAgIH07XG4gICAgLyogYWxlcnQgb24gZXZlbnRDbGljayAqL1xuICAgICRzY29wZS5hbGVydE9uRXZlbnRDbGljayA9IGZ1bmN0aW9uKCBkYXRlLCBqc0V2ZW50LCB2aWV3KXtcbiAgICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9IChkYXRlLnRpdGxlICsgJyB3YXMgY2xpY2tlZCAnKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIERyb3AgKi9cbiAgICAgJHNjb3BlLmFsZXJ0T25Ecm9wID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyl7XG4gICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9ICgnRXZlbnQgRHJvcGVkIHRvIG1ha2UgZGF5RGVsdGEgJyArIGRlbHRhKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIFJlc2l6ZSAqL1xuICAgICRzY29wZS5hbGVydE9uUmVzaXplID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyApe1xuICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoJ0V2ZW50IFJlc2l6ZWQgdG8gbWFrZSBkYXlEZWx0YSAnICsgZGVsdGEpO1xuICAgIH07XG4gICAgLyogYWRkIGFuZCByZW1vdmVzIGFuIGV2ZW50IHNvdXJjZSBvZiBjaG9pY2UgKi9cbiAgICAkc2NvcGUuYWRkUmVtb3ZlRXZlbnRTb3VyY2UgPSBmdW5jdGlvbihzb3VyY2VzLHNvdXJjZSkge1xuICAgICAgdmFyIGNhbkFkZCA9IDA7XG4gICAgICBhbmd1bGFyLmZvckVhY2goc291cmNlcyxmdW5jdGlvbih2YWx1ZSwga2V5KXtcbiAgICAgICAgaWYoc291cmNlc1trZXldID09PSBzb3VyY2Upe1xuICAgICAgICAgIHNvdXJjZXMuc3BsaWNlKGtleSwxKTtcbiAgICAgICAgICBjYW5BZGQgPSAxO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmKGNhbkFkZCA9PT0gMCl7XG4gICAgICAgIHNvdXJjZXMucHVzaChzb3VyY2UpO1xuICAgICAgfVxuICAgIH07XG4gICAgLyogYWRkIGN1c3RvbSBldmVudCovXG4gICAgJHNjb3BlLmFkZEV2ZW50ID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnB1c2goe1xuICAgICAgICB0aXRsZTogJ09wZW4gU2VzYW1lJyxcbiAgICAgICAgc3RhcnQ6IG5ldyBEYXRlKHksIG0sIDI4KSxcbiAgICAgICAgZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksXG4gICAgICAgIGNsYXNzTmFtZTogWydvcGVuU2VzYW1lJ11cbiAgICAgIH0pO1xuICAgIH07XG4gICAgLyogcmVtb3ZlIGV2ZW50ICovXG4gICAgJHNjb3BlLnJlbW92ZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnNwbGljZShpbmRleCwxKTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLmNoYW5nZVZpZXcgPSBmdW5jdGlvbih2aWV3LGNhbGVuZGFyKSB7XG4gICAgICB1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0uZnVsbENhbGVuZGFyKCdjaGFuZ2VWaWV3Jyx2aWV3KTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLnJlbmRlckNhbGVuZGVyID0gZnVuY3Rpb24oY2FsZW5kYXIpIHtcbiAgICAgIGlmKHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXSl7XG4gICAgICAgIHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXS5mdWxsQ2FsZW5kYXIoJ3JlbmRlcicpO1xuICAgICAgfVxuICAgIH07XG4gICAgIC8qIFJlbmRlciBUb29sdGlwICovXG4gICAgJHNjb3BlLmV2ZW50UmVuZGVyID0gZnVuY3Rpb24oIGV2ZW50LCBlbGVtZW50LCB2aWV3ICkgeyBcbiAgICAgICAgZWxlbWVudC5hdHRyKHsndG9vbHRpcCc6IGV2ZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAgJ3Rvb2x0aXAtYXBwZW5kLXRvLWJvZHknOiB0cnVlfSk7XG4gICAgICAgICRjb21waWxlKGVsZW1lbnQpKCRzY29wZSk7XG4gICAgfTtcbiAgICAvKiBjb25maWcgb2JqZWN0ICovXG4gICAgJHNjb3BlLnVpQ29uZmlnID0ge1xuICAgICAgY2FsZW5kYXI6e1xuICAgICAgICBoZWlnaHQ6IDQ1MCxcbiAgICAgICAgZWRpdGFibGU6IHRydWUsXG4gICAgICAgIGhlYWRlcjp7XG4gICAgICAgICAgbGVmdDogJ3RpdGxlJyxcbiAgICAgICAgICBjZW50ZXI6ICcnLFxuICAgICAgICAgIHJpZ2h0OiAndG9kYXkgcHJldixuZXh0J1xuICAgICAgICB9LFxuICAgICAgICBldmVudENsaWNrOiAkc2NvcGUuYWxlcnRPbkV2ZW50Q2xpY2ssXG4gICAgICAgIGV2ZW50RHJvcDogJHNjb3BlLmFsZXJ0T25Ecm9wLFxuICAgICAgICBldmVudFJlc2l6ZTogJHNjb3BlLmFsZXJ0T25SZXNpemUsXG4gICAgICAgIGV2ZW50UmVuZGVyOiAkc2NvcGUuZXZlbnRSZW5kZXJcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgJHNjb3BlLmNoYW5nZUxhbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmKCRzY29wZS5jaGFuZ2VUbyA9PT0gJ0h1bmdhcmlhbicpe1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXMgPSBbXCJWYXPDoXJuYXBcIiwgXCJIw6l0ZsWRXCIsIFwiS2VkZFwiLCBcIlN6ZXJkYVwiLCBcIkNzw7x0w7ZydMO2a1wiLCBcIlDDqW50ZWtcIiwgXCJTem9tYmF0XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlZhc1wiLCBcIkjDqXRcIiwgXCJLZWRkXCIsIFwiU3plXCIsIFwiQ3PDvHRcIiwgXCJQw6luXCIsIFwiU3pvXCJdO1xuICAgICAgICAkc2NvcGUuY2hhbmdlVG89ICdFbmdsaXNoJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICRzY29wZS51aUNvbmZpZy5jYWxlbmRhci5kYXlOYW1lcyA9IFtcIlN1bmRheVwiLCBcIk1vbmRheVwiLCBcIlR1ZXNkYXlcIiwgXCJXZWRuZXNkYXlcIiwgXCJUaHVyc2RheVwiLCBcIkZyaWRheVwiLCBcIlNhdHVyZGF5XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlN1blwiLCBcIk1vblwiLCBcIlR1ZVwiLCBcIldlZFwiLCBcIlRodVwiLCBcIkZyaVwiLCBcIlNhdFwiXTtcbiAgICAgICAgJHNjb3BlLmNoYW5nZVRvID0gJ0h1bmdhcmlhbic7XG4gICAgICB9XG4gICAgfTtcbiAgICAvKiBldmVudCBzb3VyY2VzIGFycmF5Ki9cbiAgICAkc2NvcGUuZXZlbnRTb3VyY2VzID0gWyRzY29wZS5ldmVudHMsICRzY29wZS5ldmVudFNvdXJjZSwgJHNjb3BlLmV2ZW50c0ZdO1xuICAgICRzY29wZS5ldmVudFNvdXJjZXMyID0gWyRzY29wZS5jYWxFdmVudHNFeHQsICRzY29wZS5ldmVudHNGLCAkc2NvcGUuZXZlbnRzXTtcblxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSgnTGl2ZScpO1xufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uTGl2ZScsIHtcbiAgICAgICAgdXJsOiAnL2xpdmUnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0xpdmVDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ2Z1bGxzdGFja0xvZ28nLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9jb21tb24vZGlyZWN0aXZlcy9mdWxsc3RhY2stbG9nby9mdWxsc3RhY2stbG9nby5odG1sJ1xuICAgIH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHt9LFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgICAgICAgICBzY29wZS5pdGVtcyA9IFtcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnSG9tZScsIHN0YXRlOiAnaG9tZScgfSxcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnQWJvdXQnLCBzdGF0ZTogJ2Fib3V0JyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEb2N1bWVudGF0aW9uJywgc3RhdGU6ICdkb2NzJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdNZW1iZXJzIE9ubHknLCBzdGF0ZTogJ21lbWJlcnNPbmx5JywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICB9XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ3JhbmRvR3JlZXRpbmcnLCBmdW5jdGlvbiAoUmFuZG9tR3JlZXRpbmdzKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3JhbmRvLWdyZWV0aW5nL3JhbmRvLWdyZWV0aW5nLmh0bWwnLFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHNjb3BlLmdyZWV0aW5nID0gUmFuZG9tR3JlZXRpbmdzLmdldFJhbmRvbUdyZWV0aW5nKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG59KTtcbiJdfQ==
