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

app.config(function ($stateProvider) {
    $stateProvider.state('docs', {
        url: '/docs',
        templateUrl: 'js/docs/docs.html'
    });
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
app.controller('FriendsController', function ($scope, $state) {
    $scope.friends = friends.sort(compare);
});

function compare(a, b) {
    if (a.score < b.score) return 1;
    if (a.score > b.score) return -1;
    return 0;
}

var friends = [{
    name: 'John Hancock',
    image: 'http://lorempixel.com/100/100',
    score: 20
}, {
    name: 'Sebastian Lofgren',
    image: 'http://lorempixel.com/120/120',
    score: 20

}, {
    name: 'Donald Trump',
    image: 'http://lorempixel.com/110/110',
    score: 32
}, {
    name: 'Bill Hader',
    image: 'http://lorempixel.com/105/105',
    score: 21
}, {
    name: 'Salvador Dali',
    image: 'http://lorempixel.com/101/101',
    score: 23
}];

app.config(function ($stateProvider) {

    $stateProvider.state('demo.Friend', {
        url: '/friends',
        templateUrl: 'js/demo/Friends/friends.html',
        controller: 'FriendsController'
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
            defaultView: 'agendaDay',
            height: 450,
            editable: true,
            header: {
                left: 'title',
                center: 'agendaDay, month, agendaWeek',
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

app.controller('TrainerController', function ($scope, $state) {
    $scope.trainers = trainers.sort();
});

var trainers = [{
    name: 'John Hancock',
    image: 'http://lorempixel.com/100/100',
    speciality: 'Chair'
}, {
    name: 'Sebastian Lofgren',
    image: 'http://lorempixel.com/120/120',
    speciality: 'Chair'

}, {
    name: 'Donald Trump',
    image: 'http://lorempixel.com/110/110',
    speciality: 'Aerobics'
}, {
    name: 'Bill Hader',
    image: 'http://lorempixel.com/105/105',
    speciality: 'Personal Trainer'
}, {
    name: 'Salvador Dali',
    image: 'http://lorempixel.com/101/101',
    speciality: "Physical Therapist"
}];

app.config(function ($stateProvider) {

    $stateProvider.state('demo.Trainer', {
        url: '/trainers',
        templateUrl: 'js/demo/Trainers/trainers.html',
        controller: 'TrainerController'
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZG9jcy9kb2NzLmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibWVtYmVycy1vbmx5L21lbWJlcnMtb25seS5qcyIsImxvZ2luL2xvZ2luLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9GdWxsc3RhY2tQaWNzLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9SYW5kb21HcmVldGluZ3MuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuY3RybC5qcyIsImRlbW8vRGVtYW5kL2RlbWFuZC5zdGF0ZS5qcyIsImRlbW8vRnJpZW5kcy9mcmllbmRzLmN0cmwuanMiLCJkZW1vL0ZyaWVuZHMvZnJpZW5kcy5zdGF0ZS5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5jdHJsLmpzIiwiZGVtby9MaXZlL2xpdmVDbGFzc2VzLnN0YXRlLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5jdHJsLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5zdGF0ZS5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL3JhbmRvLWdyZWV0aW5nL3JhbmRvLWdyZWV0aW5nLmpzIl0sIm5hbWVzIjpbIndpbmRvdyIsImFwcCIsImFuZ3VsYXIiLCJtb2R1bGUiLCJjb25maWciLCIkdXJsUm91dGVyUHJvdmlkZXIiLCIkbG9jYXRpb25Qcm92aWRlciIsImh0bWw1TW9kZSIsIm90aGVyd2lzZSIsIndoZW4iLCJsb2NhdGlvbiIsInJlbG9hZCIsInJ1biIsIiRyb290U2NvcGUiLCIkd2luZG93IiwiJGxvY2F0aW9uIiwiZ2EiLCIkb24iLCJldmVudCIsInRvU3RhdGUiLCJ0b1BhcmFtcyIsImZyb21TdGF0ZSIsImZyb21QYXJhbXMiLCJ0aHJvd25FcnJvciIsImNvbnNvbGUiLCJpbmZvIiwiZXJyb3IiLCJwYXRoIiwiQXV0aFNlcnZpY2UiLCIkc3RhdGUiLCJkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoIiwic3RhdGUiLCJkYXRhIiwiYXV0aGVudGljYXRlIiwiaXNBdXRoZW50aWNhdGVkIiwicHJldmVudERlZmF1bHQiLCJnZXRMb2dnZWRJblVzZXIiLCJ0aGVuIiwidXNlciIsImdvIiwibmFtZSIsIiRzdGF0ZVByb3ZpZGVyIiwidXJsIiwiY29udHJvbGxlciIsInRlbXBsYXRlVXJsIiwiJHNjb3BlIiwiRnVsbHN0YWNrUGljcyIsImltYWdlcyIsIl8iLCJzaHVmZmxlIiwiY2hhbmdlQ2xhc3NDYXRlZ29yeSIsImNhdGVnb3J5IiwiY2xhc3NDYXRlZ29yeSIsIkVycm9yIiwiZmFjdG9yeSIsImlvIiwib3JpZ2luIiwiY29uc3RhbnQiLCJsb2dpblN1Y2Nlc3MiLCJsb2dpbkZhaWxlZCIsImxvZ291dFN1Y2Nlc3MiLCJzZXNzaW9uVGltZW91dCIsIm5vdEF1dGhlbnRpY2F0ZWQiLCJub3RBdXRob3JpemVkIiwiJHEiLCJBVVRIX0VWRU5UUyIsInN0YXR1c0RpY3QiLCJyZXNwb25zZUVycm9yIiwicmVzcG9uc2UiLCIkYnJvYWRjYXN0Iiwic3RhdHVzIiwicmVqZWN0IiwiJGh0dHBQcm92aWRlciIsImludGVyY2VwdG9ycyIsInB1c2giLCIkaW5qZWN0b3IiLCJnZXQiLCJzZXJ2aWNlIiwiJGh0dHAiLCJTZXNzaW9uIiwib25TdWNjZXNzZnVsTG9naW4iLCJjcmVhdGUiLCJmcm9tU2VydmVyIiwiY2F0Y2giLCJsb2dpbiIsImNyZWRlbnRpYWxzIiwicG9zdCIsIm1lc3NhZ2UiLCJsb2dvdXQiLCJkZXN0cm95Iiwic2VsZiIsIiR1aWJNb2RhbCIsIm9wZW5Nb2RhbCIsIm9wZW4iLCJ0ZW1wbGF0ZSIsIlNlY3JldFN0YXNoIiwiZ2V0U3Rhc2giLCJzdGFzaCIsInNlbmRMb2dpbiIsImxvZ2luSW5mbyIsImdldFJhbmRvbUZyb21BcnJheSIsImFyciIsIk1hdGgiLCJmbG9vciIsInJhbmRvbSIsImxlbmd0aCIsImdyZWV0aW5ncyIsImdldFJhbmRvbUdyZWV0aW5nIiwiY2xhc3NlcyIsInNvcnRCeVR5cGUiLCJ0eXBlIiwiZmlsdGVyIiwidmlkZW8iLCJUeXBlIiwiZnJpZW5kcyIsInNvcnQiLCJjb21wYXJlIiwiYSIsImIiLCJzY29yZSIsImltYWdlIiwiJGNvbXBpbGUiLCJ1aUNhbGVuZGFyQ29uZmlnIiwiZGF0ZSIsIkRhdGUiLCJkIiwiZ2V0RGF0ZSIsIm0iLCJnZXRNb250aCIsInkiLCJnZXRGdWxsWWVhciIsImNoYW5nZVRvIiwiZXZlbnRTb3VyY2UiLCJjbGFzc05hbWUiLCJjdXJyZW50VGltZXpvbmUiLCJldmVudHMiLCJ0aXRsZSIsInN0YXJ0IiwiZW5kIiwiaWQiLCJhbGxEYXkiLCJldmVudHNGIiwidGltZXpvbmUiLCJjYWxsYmFjayIsInMiLCJnZXRUaW1lIiwiZSIsImNhbEV2ZW50c0V4dCIsImNvbG9yIiwidGV4dENvbG9yIiwiYWxlcnRPbkV2ZW50Q2xpY2siLCJqc0V2ZW50IiwidmlldyIsImFsZXJ0TWVzc2FnZSIsImFsZXJ0T25Ecm9wIiwiZGVsdGEiLCJyZXZlcnRGdW5jIiwidWkiLCJhbGVydE9uUmVzaXplIiwiYWRkUmVtb3ZlRXZlbnRTb3VyY2UiLCJzb3VyY2VzIiwic291cmNlIiwiY2FuQWRkIiwiZm9yRWFjaCIsInZhbHVlIiwia2V5Iiwic3BsaWNlIiwiYWRkRXZlbnQiLCJyZW1vdmUiLCJpbmRleCIsImNoYW5nZVZpZXciLCJjYWxlbmRhciIsImNhbGVuZGFycyIsImZ1bGxDYWxlbmRhciIsInJlbmRlckNhbGVuZGVyIiwiZXZlbnRSZW5kZXIiLCJlbGVtZW50IiwiYXR0ciIsInVpQ29uZmlnIiwiZGVmYXVsdFZpZXciLCJoZWlnaHQiLCJlZGl0YWJsZSIsImhlYWRlciIsImxlZnQiLCJjZW50ZXIiLCJyaWdodCIsImV2ZW50Q2xpY2siLCJldmVudERyb3AiLCJldmVudFJlc2l6ZSIsImNoYW5nZUxhbmciLCJkYXlOYW1lcyIsImRheU5hbWVzU2hvcnQiLCJldmVudFNvdXJjZXMiLCJldmVudFNvdXJjZXMyIiwidHJhaW5lcnMiLCJzcGVjaWFsaXR5IiwiZGlyZWN0aXZlIiwicmVzdHJpY3QiLCJzY29wZSIsImxpbmsiLCJpdGVtcyIsImxhYmVsIiwiYXV0aCIsImlzTG9nZ2VkSW4iLCJzZXRVc2VyIiwicmVtb3ZlVXNlciIsIlJhbmRvbUdyZWV0aW5ncyIsImdyZWV0aW5nIl0sIm1hcHBpbmdzIjoiQUFBQTs7QUFDQUEsT0FBQUMsR0FBQSxHQUFBQyxRQUFBQyxNQUFBLENBQUEsWUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLGFBQUEsRUFBQSxXQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBRixJQUFBRyxNQUFBLENBQUEsVUFBQUMsa0JBQUEsRUFBQUMsaUJBQUEsRUFBQTtBQUNBO0FBQ0FBLHNCQUFBQyxTQUFBLENBQUEsSUFBQTtBQUNBO0FBQ0FGLHVCQUFBRyxTQUFBLENBQUEsR0FBQTtBQUNBO0FBQ0FILHVCQUFBSSxJQUFBLENBQUEsaUJBQUEsRUFBQSxZQUFBO0FBQ0FULGVBQUFVLFFBQUEsQ0FBQUMsTUFBQTtBQUNBLEtBRkE7QUFHQSxDQVRBOztBQVdBO0FBQ0FWLElBQUFXLEdBQUEsQ0FBQSxVQUFBQyxVQUFBLEVBQUFDLE9BQUEsRUFBQUMsU0FBQSxFQUFBO0FBQ0FELFlBQUFFLEVBQUEsQ0FBQSxRQUFBLEVBQUEsZUFBQSxFQUFBLE1BQUE7QUFDQUgsZUFBQUksR0FBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQUMsS0FBQSxFQUFBQyxPQUFBLEVBQUFDLFFBQUEsRUFBQUMsU0FBQSxFQUFBQyxVQUFBLEVBQUFDLFdBQUEsRUFBQTtBQUNBQyxnQkFBQUMsSUFBQSxDQUFBLHNKQUFBO0FBQ0FELGdCQUFBRSxLQUFBLENBQUFILFdBQUE7QUFDQSxLQUhBO0FBSUFWLGVBQUFJLEdBQUEs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aEwsNEJBQUFRLGVBQUEsR0FBQUMsSUFBQSxDQUFBLFVBQUFDLElBQUEsRUFBQTtBQUNBZ0ssMEJBQUFoSyxJQUFBLEdBQUFBLElBQUE7QUFDQSxpQkFGQTtBQUdBLGFBSkE7O0FBTUEsZ0JBQUF1SyxhQUFBLFNBQUFBLFVBQUEsR0FBQTtBQUNBUCxzQkFBQWhLLElBQUEsR0FBQSxJQUFBO0FBQ0EsYUFGQTs7QUFJQXNLOztBQUVBL0wsdUJBQUFJLEdBQUEsQ0FBQWdELFlBQUFQLFlBQUEsRUFBQWtKLE9BQUE7QUFDQS9MLHVCQUFBSSxHQUFBLENBQUFnRCxZQUFBTCxhQUFBLEVBQUFpSixVQUFBO0FBQ0FoTSx1QkFBQUksR0FBQSxDQUFBZ0QsWUFBQUosY0FBQSxFQUFBZ0osVUFBQTtBQUVBOztBQXpDQSxLQUFBO0FBNkNBLENBL0NBOztBQ0FBNU0sSUFBQW1NLFNBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQVUsZUFBQSxFQUFBOztBQUVBLFdBQUE7QUFDQVQsa0JBQUEsR0FEQTtBQUVBekoscUJBQUEseURBRkE7QUFHQTJKLGNBQUEsY0FBQUQsS0FBQSxFQUFBO0FBQ0FBLGtCQUFBUyxRQUFBLEdBQUFELGdCQUFBbkcsaUJBQUEsRUFBQTtBQUNBO0FBTEEsS0FBQTtBQVFBLENBVkEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnQ2FyZUZhckFwcCcsIFsnZnNhUHJlQnVpbHQnLCd1aS5jYWxlbmRhcicsJ3VpLnJvdXRlcicsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvJyk7XG4gICAgLy8gVHJpZ2dlciBwYWdlIHJlZnJlc2ggd2hlbiBhY2Nlc3NpbmcgYW4gT0F1dGggcm91dGVcbiAgICAkdXJsUm91dGVyUHJvdmlkZXIud2hlbignL2F1dGgvOnByb3ZpZGVyJywgZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfSk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBsaXN0ZW5pbmcgdG8gZXJyb3JzIGJyb2FkY2FzdGVkIGJ5IHVpLXJvdXRlciwgdXN1YWxseSBvcmlnaW5hdGluZyBmcm9tIHJlc29sdmVzXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkd2luZG93LCAkbG9jYXRpb24pIHtcbiAgICAkd2luZG93LmdhKCdjcmVhdGUnLCAnVUEtODU1NTY4NDYtMScsICdhdXRvJyk7XG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZUVycm9yJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlLCBmcm9tUGFyYW1zLCB0aHJvd25FcnJvcikge1xuICAgICAgICBjb25zb2xlLmluZm8oJ1RoZSBmb2xsb3dpbmcgZXJyb3Igd2FzIHRocm93biBieSB1aS1yb3V0ZXIgd2hpbGUgdHJhbnNpdGlvbmluZyB0byBzdGF0ZSBcIiR7dG9TdGF0ZS5uYW1lfVwiLiBUaGUgb3JpZ2luIG9mIHRoaXMgZXJyb3IgaXMgcHJvYmFibHkgYSByZXNvbHZlIGZ1bmN0aW9uOicpO1xuICAgICAgICBjb25zb2xlLmVycm9yKHRocm93bkVycm9yKTtcbiAgICB9KTtcbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSkge1xuICAgICAgICAkd2luZG93LmdhKCdzZW5kJywgJ3BhZ2V2aWV3JywgJGxvY2F0aW9uLnBhdGgoKSk7XG4gICAgfSk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSwgJHdpbmRvdywgJGxvY2F0aW9uKSB7XG5cbiAgICAvLyBUaGUgZ2l2ZW4gc3RhdGUgcmVxdWlyZXMgYW4gYXV0aGVudGljYXRlZCB1c2VyLlxuICAgIHZhciBkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kYXRhICYmIHN0YXRlLmRhdGEuYXV0aGVudGljYXRlO1xuICAgIH07XG5cbiAgICAvLyAkc3RhdGVDaGFuZ2VTdGFydCBpcyBhbiBldmVudCBmaXJlZFxuICAgIC8vIHdoZW5ldmVyIHRoZSBwcm9jZXNzIG9mIGNoYW5naW5nIGEgc3RhdGUgYmVnaW5zLlxuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMpIHtcblxuICAgICAgICAgJHdpbmRvdy5nYSgnc2VuZCcsICdwYWdldmlld0NsaWNrJywgJGxvY2F0aW9uLnBhdGgoKSk7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgLy8gUmVnaXN0ZXIgb3VyICphYm91dCogc3RhdGUuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2Fib3V0Jywge1xuICAgICAgICB1cmw6ICcvYWJvdXQnLFxuICAgICAgICBjb250cm9sbGVyOiAnQWJvdXRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9hYm91dC9hYm91dC5odG1sJ1xuICAgIH0pO1xuXG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0Fib3V0Q29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsIEZ1bGxzdGFja1BpY3MpIHtcblxuICAgIC8vIEltYWdlcyBvZiBiZWF1dGlmdWwgRnVsbHN0YWNrIHBlb3BsZS5cbiAgICAkc2NvcGUuaW1hZ2VzID0gXy5zaHVmZmxlKEZ1bGxzdGFja1BpY3MpO1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RvY3MnLCB7XG4gICAgICAgIHVybDogJy9kb2NzJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kb2NzL2RvY3MuaHRtbCdcbiAgICB9KTtcbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoJ0RlbW9Db250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdFxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSA9IGZ1bmN0aW9uIChjYXRlZ29yeSkge1xuXHRcdCRzY29wZS5jbGFzc0NhdGVnb3J5ID0gY2F0ZWdvcnk7XG5cdFx0JHN0YXRlLmdvKCdkZW1vLicrY2F0ZWdvcnkpXG5cdH1cblxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSgnTGl2ZScpO1xufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8nLCB7XG4gICAgICAgIHVybDogJy9kZW1vJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL2RlbW8uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdEZW1vQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiKGZ1bmN0aW9uICgpIHtcblxuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIEhvcGUgeW91IGRpZG4ndCBmb3JnZXQgQW5ndWxhciEgRHVoLWRveS5cbiAgICBpZiAoIXdpbmRvdy5hbmd1bGFyKSB0aHJvdyBuZXcgRXJyb3IoJ0kgY2FuXFwndCBmaW5kIEFuZ3VsYXIhJyk7XG5cbiAgICB2YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ2ZzYVByZUJ1aWx0JywgW10pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ1NvY2tldCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF3aW5kb3cuaW8pIHRocm93IG5ldyBFcnJvcignc29ja2V0LmlvIG5vdCBmb3VuZCEnKTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5pbyh3aW5kb3cubG9jYXRpb24ub3JpZ2luKTtcbiAgICB9KTtcblxuICAgIC8vIEFVVEhfRVZFTlRTIGlzIHVzZWQgdGhyb3VnaG91dCBvdXIgYXBwIHRvXG4gICAgLy8gYnJvYWRjYXN0IGFuZCBsaXN0ZW4gZnJvbSBhbmQgdG8gdGhlICRyb290U2NvcGVcbiAgICAvLyBmb3IgaW1wb3J0YW50IGV2ZW50cyBhYm91dCBhdXRoZW50aWNhdGlvbiBmbG93LlxuICAgIGFwcC5jb25zdGFudCgnQVVUSF9FVkVOVFMnLCB7XG4gICAgICAgIGxvZ2luU3VjY2VzczogJ2F1dGgtbG9naW4tc3VjY2VzcycsXG4gICAgICAgIGxvZ2luRmFpbGVkOiAnYXV0aC1sb2dpbi1mYWlsZWQnLFxuICAgICAgICBsb2dvdXRTdWNjZXNzOiAnYXV0aC1sb2dvdXQtc3VjY2VzcycsXG4gICAgICAgIHNlc3Npb25UaW1lb3V0OiAnYXV0aC1zZXNzaW9uLXRpbWVvdXQnLFxuICAgICAgICBub3RBdXRoZW50aWNhdGVkOiAnYXV0aC1ub3QtYXV0aGVudGljYXRlZCcsXG4gICAgICAgIG5vdEF1dGhvcml6ZWQ6ICdhdXRoLW5vdC1hdXRob3JpemVkJ1xuICAgIH0pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ0F1dGhJbnRlcmNlcHRvcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkcSwgQVVUSF9FVkVOVFMpIHtcbiAgICAgICAgdmFyIHN0YXR1c0RpY3QgPSB7XG4gICAgICAgICAgICA0MDE6IEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsXG4gICAgICAgICAgICA0MDM6IEFVVEhfRVZFTlRTLm5vdEF1dGhvcml6ZWQsXG4gICAgICAgICAgICA0MTk6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LFxuICAgICAgICAgICAgNDQwOiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KHN0YXR1c0RpY3RbcmVzcG9uc2Uuc3RhdHVzXSwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QocmVzcG9uc2UpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBhcHAuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyKSB7XG4gICAgICAgICRodHRwUHJvdmlkZXIuaW50ZXJjZXB0b3JzLnB1c2goW1xuICAgICAgICAgICAgJyRpbmplY3RvcicsXG4gICAgICAgICAgICBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRpbmplY3Rvci5nZXQoJ0F1dGhJbnRlcmNlcHRvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICBdKTtcbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gcmVzcG9uc2UuZGF0YS51c2VyO1xuICAgICAgICAgICAgU2Vzc2lvbi5jcmVhdGUodXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiB1c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXNlcyB0aGUgc2Vzc2lvbiBmYWN0b3J5IHRvIHNlZSBpZiBhblxuICAgICAgICAvLyBhdXRoZW50aWNhdGVkIHVzZXIgaXMgY3VycmVudGx5IHJlZ2lzdGVyZWQuXG4gICAgICAgIHRoaXMuaXNBdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICEhU2Vzc2lvbi51c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZ2V0TG9nZ2VkSW5Vc2VyID0gZnVuY3Rpb24gKGZyb21TZXJ2ZXIpIHtcblxuICAgICAgICAgICAgLy8gSWYgYW4gYXV0aGVudGljYXRlZCBzZXNzaW9uIGV4aXN0cywgd2VcbiAgICAgICAgICAgIC8vIHJldHVybiB0aGUgdXNlciBhdHRhY2hlZCB0byB0aGF0IHNlc3Npb25cbiAgICAgICAgICAgIC8vIHdpdGggYSBwcm9taXNlLiBUaGlzIGVuc3VyZXMgdGhhdCB3ZSBjYW5cbiAgICAgICAgICAgIC8vIGFsd2F5cyBpbnRlcmZhY2Ugd2l0aCB0aGlzIG1ldGhvZCBhc3luY2hyb25vdXNseS5cblxuICAgICAgICAgICAgLy8gT3B0aW9uYWxseSwgaWYgdHJ1ZSBpcyBnaXZlbiBhcyB0aGUgZnJvbVNlcnZlciBwYXJhbWV0ZXIsXG4gICAgICAgICAgICAvLyB0aGVuIHRoaXMgY2FjaGVkIHZhbHVlIHdpbGwgbm90IGJlIHVzZWQuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQXV0aGVudGljYXRlZCgpICYmIGZyb21TZXJ2ZXIgIT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEud2hlbihTZXNzaW9uLnVzZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNYWtlIHJlcXVlc3QgR0VUIC9zZXNzaW9uLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIHVzZXIsIGNhbGwgb25TdWNjZXNzZnVsTG9naW4gd2l0aCB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgNDAxIHJlc3BvbnNlLCB3ZSBjYXRjaCBpdCBhbmQgaW5zdGVhZCByZXNvbHZlIHRvIG51bGwuXG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvc2Vzc2lvbicpLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dpbiA9IGZ1bmN0aW9uIChjcmVkZW50aWFscykge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJy9sb2dpbicsIGNyZWRlbnRpYWxzKVxuICAgICAgICAgICAgICAgIC50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKVxuICAgICAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QoeyBtZXNzYWdlOiAnSW52YWxpZCBsb2dpbiBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KCkpO1xuIiwiXG5hcHAuY29udHJvbGxlcignZ3JpZEN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkdWliTW9kYWwpIHtcdFxuXG5cdCRzY29wZS5vcGVuTW9kYWwgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHVpYk1vZGFsLm9wZW4oe1xuXHRcdFx0dGVtcGxhdGVVcmw6ICdqcy9ncmlkL21vZGFsQ29udGVudC5odG1sJ1xuXHRcdH0pXG5cdH1cbn0pXG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAvLyBSZWdpc3RlciBvdXIgKmFib3V0KiBzdGF0ZS5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbGFuZGluZycsIHtcbiAgICAgICAgdXJsOiAnLycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvbGFuZGluZy9sYW5kaW5nLmh0bWwnXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbWVtYmVyc09ubHknLCB7XG4gICAgICAgIHVybDogJy9tZW1iZXJzLWFyZWEnLFxuICAgICAgICB0ZW1wbGF0ZTogJzxpbWcgbmctcmVwZWF0PVwiaXRlbSBpbiBzdGFzaFwiIHdpZHRoPVwiMzAwXCIgbmctc3JjPVwie3sgaXRlbSB9fVwiIC8+JyxcbiAgICAgICAgY29udHJvbGxlcjogZnVuY3Rpb24gKCRzY29wZSwgU2VjcmV0U3Rhc2gpIHtcbiAgICAgICAgICAgIFNlY3JldFN0YXNoLmdldFN0YXNoKCkudGhlbihmdW5jdGlvbiAoc3Rhc2gpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuc3Rhc2ggPSBzdGFzaDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGRhdGEuYXV0aGVudGljYXRlIGlzIHJlYWQgYnkgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgLy8gdGhhdCBjb250cm9scyBhY2Nlc3MgdG8gdGhpcyBzdGF0ZS4gUmVmZXIgdG8gYXBwLmpzLlxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuICAgIH0pO1xuXG59KTtcblxuYXBwLmZhY3RvcnkoJ1NlY3JldFN0YXNoJywgZnVuY3Rpb24gKCRodHRwKSB7XG5cbiAgICB2YXIgZ2V0U3Rhc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9hcGkvbWVtYmVycy9zZWNyZXQtc3Rhc2gnKS50aGVuKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmRhdGE7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXRTdGFzaDogZ2V0U3Rhc2hcbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbG9naW4nLCB7XG4gICAgICAgIHVybDogJy9sb2dpbicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvbG9naW4vbG9naW4uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdMb2dpbkN0cmwnXG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignTG9naW5DdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgJHNjb3BlLmxvZ2luID0ge307XG4gICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG5cbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLic7XG4gICAgICAgIH0pO1xuXG4gICAgfTtcblxufSk7XG4iLCJhcHAuZmFjdG9yeSgnRnVsbHN0YWNrUGljcycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I3Z0JYdWxDQUFBWFFjRS5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9mYmNkbi1zcGhvdG9zLWMtYS5ha2FtYWloZC5uZXQvaHBob3Rvcy1hay14YXAxL3QzMS4wLTgvMTA4NjI0NTFfMTAyMDU2MjI5OTAzNTkyNDFfODAyNzE2ODg0MzMxMjg0MTEzN19vLmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1MS1VzaElnQUV5OVNLLmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjc5LVg3b0NNQUFrdzd5LmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1VajlDT0lJQUlGQWgwLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjZ5SXlGaUNFQUFxbDEyLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0UtVDc1bFdBQUFtcXFKLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0V2WkFnLVZBQUFrOTMyLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0VnTk1lT1hJQUlmRGhLLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0VReUlETldnQUF1NjBCLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0NGM1Q1UVc4QUUybEdKLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FlVnc1U1dvQUFBTHNqLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FhSklQN1VrQUFsSUdzLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FRT3c5bFdFQUFZOUZsLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1PUWJWckNNQUFOd0lNLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjliX2Vyd0NZQUF3UmNKLnBuZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjVQVGR2bkNjQUVBbDR4LmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjRxd0MwaUNZQUFsUEdoLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjJiMzN2UklVQUE5bzFELmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQndwSXdyMUlVQUF2TzJfLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQnNTc2VBTkNZQUVPaEx3LmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0o0dkxmdVV3QUFkYTRMLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0k3d3pqRVZFQUFPUHBTLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0lkSHZUMlVzQUFubkhWLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0dDaVBfWVdZQUFvNzVWLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0lTNEpQSVdJQUkzN3F1LmpwZzpsYXJnZSdcbiAgICBdO1xufSk7XG4iLCJhcHAuZmFjdG9yeSgnUmFuZG9tR3JlZXRpbmdzJywgZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIGdldFJhbmRvbUZyb21BcnJheSA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgICAgICAgcmV0dXJuIGFycltNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnIubGVuZ3RoKV07XG4gICAgfTtcblxuICAgIHZhciBncmVldGluZ3MgPSBbXG4gICAgICAgICdIZWxsbywgd29ybGQhJyxcbiAgICAgICAgJ0F0IGxvbmcgbGFzdCwgSSBsaXZlIScsXG4gICAgICAgICdIZWxsbywgc2ltcGxlIGh1bWFuLicsXG4gICAgICAgICdXaGF0IGEgYmVhdXRpZnVsIGRheSEnLFxuICAgICAgICAnSVxcJ20gbGlrZSBhbnkgb3RoZXIgcHJvamVjdCwgZXhjZXB0IHRoYXQgSSBhbSB5b3Vycy4gOiknLFxuICAgICAgICAnVGhpcyBlbXB0eSBzdHJpbmcgaXMgZm9yIExpbmRzYXkgTGV2aW5lLicsXG4gICAgICAgICfjgZPjgpPjgavjgaHjga/jgIHjg6bjg7zjgrbjg7zmp5jjgIInLFxuICAgICAgICAnV2VsY29tZS4gVG8uIFdFQlNJVEUuJyxcbiAgICAgICAgJzpEJyxcbiAgICAgICAgJ1llcywgSSB0aGluayB3ZVxcJ3ZlIG1ldCBiZWZvcmUuJyxcbiAgICAgICAgJ0dpbW1lIDMgbWlucy4uLiBJIGp1c3QgZ3JhYmJlZCB0aGlzIHJlYWxseSBkb3BlIGZyaXR0YXRhJyxcbiAgICAgICAgJ0lmIENvb3BlciBjb3VsZCBvZmZlciBvbmx5IG9uZSBwaWVjZSBvZiBhZHZpY2UsIGl0IHdvdWxkIGJlIHRvIG5ldlNRVUlSUkVMIScsXG4gICAgXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGdyZWV0aW5nczogZ3JlZXRpbmdzLFxuICAgICAgICBnZXRSYW5kb21HcmVldGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGdldFJhbmRvbUZyb21BcnJheShncmVldGluZ3MpO1xuICAgICAgICB9XG4gICAgfTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignRGVtYW5kQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSkge1xuXHQkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXM7XG4gICRzY29wZS5zb3J0QnlUeXBlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICBpZighdHlwZSkgJHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzO1xuICAgIGVsc2Uge1xuICAgICAgJHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzLmZpbHRlcihmdW5jdGlvbiAodmlkZW8pIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvLlR5cGUgPT09IHR5cGVcbiAgICAgIH0pXG4gICAgICBcbiAgICB9XG4gIH1cbn0pXG5cbnZhciBjbGFzc2VzID0gW1xuICB7XG4gICAgXCJJRFwiOiAxLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkFlcm9iaWMgQ2hhaXIgVmlkZW9cIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PW03ekNEaWlUQlRrXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMixcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJQcmlvcml0eSBPbmVcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU9BNTVlTXlCOFMwXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMyxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJMb3cgSW1wYWN0IENoYWlyIEFlcm9iaWNzXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj0yQXVMcVloNGlySVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDQsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiQWR2YW5jZWQgQ2hhaXIgRXhlcmNpc2VcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU9DOVZid3lFRzhVXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNSxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkdlbnRsZSBZb2dhXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1HOEJzTGxQRTFtNFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDYsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJHZW50bGUgY2hhaXIgeW9nYSByb3V0aW5lXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1LRWppWHRiMmhSZ1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDcsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJXaGVlbGNoYWlyIFlvZ2FcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUZyVkUxYTJ2Z3ZBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogOCxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkVuZXJnaXppbmcgQ2hhaXIgWW9nYVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9azRTVDFqOVBmckFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA5LFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiQmFsYW5jZSBFeGVyY2lzZVwiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9ei10VUh1TlBTdHdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMCxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIkZhbGwgUHJldmVudGlvbiBFeGVyY2lzZXNcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU5KREFvQm9sZHI0XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTEsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCI3IEJhbGFuY2UgRXhlcmNpc2VzXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj12R2E1QzFRczhqQVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEyLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiUG9zdHVyYWwgU3RhYmlsaXR5XCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj16NkpvYUpnb2ZUOFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEzLFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiRWFzeSBRaWdvbmdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUFwUzFDTFdPMEJRXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTQsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJUYWkgQ2hpIGZvciBCZWdpbm5lcnNcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVZTZC1jbU9Fbm13XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTUsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJUYWkgQ2hpIGZvciBTZW5pb3JzXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1XVktMSjhCdVc4UVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE2LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiTG93IEltcGFjdCBUYWkgQ2hpXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1oYTFFRjRZeXZVd1wiXG4gIH1cbl07XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uT24tRGVtYW5kJywge1xuICAgICAgICB1cmw6ICcvb24tZGVtYW5kJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL0RlbWFuZC9vbi1kZW1hbmQuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdEZW1hbmRDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29udHJvbGxlcignRnJpZW5kc0NvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLmZyaWVuZHMgPSBmcmllbmRzLnNvcnQoY29tcGFyZSk7XG59KVxuXG5mdW5jdGlvbiBjb21wYXJlKGEsYikge1xuICBpZiAoYS5zY29yZSA8IGIuc2NvcmUpXG4gICAgcmV0dXJuIDE7XG4gIGlmIChhLnNjb3JlID4gYi5zY29yZSlcbiAgICByZXR1cm4gLTE7XG4gIHJldHVybiAwO1xufVxuXG52YXIgZnJpZW5kcyA9IFtcblx0e1xuXHRcdG5hbWU6ICdKb2huIEhhbmNvY2snLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwMC8xMDAnLFxuXHRcdHNjb3JlOiAyMFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NlYmFzdGlhbiBMb2ZncmVuJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMjAvMTIwJyxcblx0XHRzY29yZTogMjBcblx0XHRcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdEb25hbGQgVHJ1bXAnLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzExMC8xMTAnLFxuXHRcdHNjb3JlOiAzMlxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ0JpbGwgSGFkZXInLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwNS8xMDUnLFxuXHRcdHNjb3JlOiAyMVxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NhbHZhZG9yIERhbGknLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwMS8xMDEnLFxuXHRcdHNjb3JlOiAyM1xuXHR9XG5dXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uRnJpZW5kJywge1xuICAgICAgICB1cmw6ICcvZnJpZW5kcycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9GcmllbmRzL2ZyaWVuZHMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdGcmllbmRzQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ0xpdmVDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJGNvbXBpbGUsIHVpQ2FsZW5kYXJDb25maWcpIHtcblx0XG5cdHZhciBkYXRlID0gbmV3IERhdGUoKTtcbiAgICB2YXIgZCA9IGRhdGUuZ2V0RGF0ZSgpO1xuICAgIHZhciBtID0gZGF0ZS5nZXRNb250aCgpO1xuICAgIHZhciB5ID0gZGF0ZS5nZXRGdWxsWWVhcigpO1xuICAgIFxuICAgICRzY29wZS5jaGFuZ2VUbyA9ICdIdW5nYXJpYW4nO1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IHB1bGxzIGZyb20gZ29vZ2xlLmNvbSAqL1xuICAgICRzY29wZS5ldmVudFNvdXJjZSA9IHtcbiAgICAgICAgICAgIHVybDogXCJodHRwOi8vd3d3Lmdvb2dsZS5jb20vY2FsZW5kYXIvZmVlZHMvdXNhX19lbiU0MGhvbGlkYXkuY2FsZW5kYXIuZ29vZ2xlLmNvbS9wdWJsaWMvYmFzaWNcIixcbiAgICAgICAgICAgIGNsYXNzTmFtZTogJ2djYWwtZXZlbnQnLCAgICAgICAgICAgLy8gYW4gb3B0aW9uIVxuICAgICAgICAgICAgY3VycmVudFRpbWV6b25lOiAnQW1lcmljYS9DaGljYWdvJyAvLyBhbiBvcHRpb24hXG4gICAgfTtcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBjb250YWlucyBjdXN0b20gZXZlbnRzIG9uIHRoZSBzY29wZSAqL1xuICAgICRzY29wZS5ldmVudHMgPSBbXG5cdFx0XHQgICAgICB7dGl0bGU6ICdBbGwgRGF5IEV2ZW50JyxzdGFydDogbmV3IERhdGUoeSwgbSwgMSl9LFxuXHRcdFx0ICAgICAge3RpdGxlOiAnTG9uZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgLSA1KSxlbmQ6IG5ldyBEYXRlKHksIG0sIGQgLSAyKX0sXG5cdFx0XHQgICAgICB7aWQ6IDk5OSx0aXRsZTogJ1JlcGVhdGluZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgLSAzLCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7aWQ6IDk5OSx0aXRsZTogJ1JlcGVhdGluZyBFdmVudCcsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgKyA0LCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdCaXJ0aGRheSBQYXJ0eScsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQgKyAxLCAxOSwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkICsgMSwgMjIsIDMwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICAgIHt0aXRsZTogJ0NsaWNrIGZvciBHb29nbGUnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksdXJsOiAnaHR0cDovL2dvb2dsZS5jb20vJ31cblx0XHRcdCAgICBdO1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IGNhbGxzIGEgZnVuY3Rpb24gb24gZXZlcnkgdmlldyBzd2l0Y2ggKi9cbiAgICAkc2NvcGUuZXZlbnRzRiA9IGZ1bmN0aW9uIChzdGFydCwgZW5kLCB0aW1lem9uZSwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBzID0gbmV3IERhdGUoc3RhcnQpLmdldFRpbWUoKSAvIDEwMDA7XG4gICAgICB2YXIgZSA9IG5ldyBEYXRlKGVuZCkuZ2V0VGltZSgpIC8gMTAwMDtcbiAgICAgIHZhciBtID0gbmV3IERhdGUoc3RhcnQpLmdldE1vbnRoKCk7XG4gICAgICB2YXIgZXZlbnRzID0gW3t0aXRsZTogJ0ZlZWQgTWUgJyArIG0sc3RhcnQ6IHMgKyAoNTAwMDApLGVuZDogcyArICgxMDAwMDApLGFsbERheTogZmFsc2UsIGNsYXNzTmFtZTogWydjdXN0b21GZWVkJ119XTtcbiAgICAgIGNhbGxiYWNrKGV2ZW50cyk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYWxFdmVudHNFeHQgPSB7XG4gICAgICAgY29sb3I6ICcjZjAwJyxcbiAgICAgICB0ZXh0Q29sb3I6ICd5ZWxsb3cnLFxuICAgICAgIGV2ZW50czogWyBcbiAgICAgICAgICB7dHlwZToncGFydHknLHRpdGxlOiAnTHVuY2gnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0x1bmNoIDInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0NsaWNrIGZvciBHb29nbGUnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksdXJsOiAnaHR0cDovL2dvb2dsZS5jb20vJ31cbiAgICAgICAgXVxuICAgIH07XG4gICAgLyogYWxlcnQgb24gZXZlbnRDbGljayAqL1xuICAgICRzY29wZS5hbGVydE9uRXZlbnRDbGljayA9IGZ1bmN0aW9uKCBkYXRlLCBqc0V2ZW50LCB2aWV3KXtcbiAgICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9IChkYXRlLnRpdGxlICsgJyB3YXMgY2xpY2tlZCAnKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIERyb3AgKi9cbiAgICAgJHNjb3BlLmFsZXJ0T25Ecm9wID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyl7XG4gICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9ICgnRXZlbnQgRHJvcGVkIHRvIG1ha2UgZGF5RGVsdGEgJyArIGRlbHRhKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIFJlc2l6ZSAqL1xuICAgICRzY29wZS5hbGVydE9uUmVzaXplID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyApe1xuICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoJ0V2ZW50IFJlc2l6ZWQgdG8gbWFrZSBkYXlEZWx0YSAnICsgZGVsdGEpO1xuICAgIH07XG4gICAgLyogYWRkIGFuZCByZW1vdmVzIGFuIGV2ZW50IHNvdXJjZSBvZiBjaG9pY2UgKi9cbiAgICAkc2NvcGUuYWRkUmVtb3ZlRXZlbnRTb3VyY2UgPSBmdW5jdGlvbihzb3VyY2VzLHNvdXJjZSkge1xuICAgICAgdmFyIGNhbkFkZCA9IDA7XG4gICAgICBhbmd1bGFyLmZvckVhY2goc291cmNlcyxmdW5jdGlvbih2YWx1ZSwga2V5KXtcbiAgICAgICAgaWYoc291cmNlc1trZXldID09PSBzb3VyY2Upe1xuICAgICAgICAgIHNvdXJjZXMuc3BsaWNlKGtleSwxKTtcbiAgICAgICAgICBjYW5BZGQgPSAxO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmKGNhbkFkZCA9PT0gMCl7XG4gICAgICAgIHNvdXJjZXMucHVzaChzb3VyY2UpO1xuICAgICAgfVxuICAgIH07XG4gICAgLyogYWRkIGN1c3RvbSBldmVudCovXG4gICAgJHNjb3BlLmFkZEV2ZW50ID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnB1c2goe1xuICAgICAgICB0aXRsZTogJ09wZW4gU2VzYW1lJyxcbiAgICAgICAgc3RhcnQ6IG5ldyBEYXRlKHksIG0sIDI4KSxcbiAgICAgICAgZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksXG4gICAgICAgIGNsYXNzTmFtZTogWydvcGVuU2VzYW1lJ11cbiAgICAgIH0pO1xuICAgIH07XG4gICAgLyogcmVtb3ZlIGV2ZW50ICovXG4gICAgJHNjb3BlLnJlbW92ZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnNwbGljZShpbmRleCwxKTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLmNoYW5nZVZpZXcgPSBmdW5jdGlvbih2aWV3LGNhbGVuZGFyKSB7XG4gICAgICB1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0uZnVsbENhbGVuZGFyKCdjaGFuZ2VWaWV3Jyx2aWV3KTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLnJlbmRlckNhbGVuZGVyID0gZnVuY3Rpb24oY2FsZW5kYXIpIHtcbiAgICAgIGlmKHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXSl7XG4gICAgICAgIHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXS5mdWxsQ2FsZW5kYXIoJ3JlbmRlcicpO1xuICAgICAgfVxuICAgIH07XG4gICAgIC8qIFJlbmRlciBUb29sdGlwICovXG4gICAgJHNjb3BlLmV2ZW50UmVuZGVyID0gZnVuY3Rpb24oIGV2ZW50LCBlbGVtZW50LCB2aWV3ICkgeyBcbiAgICAgICAgZWxlbWVudC5hdHRyKHsndG9vbHRpcCc6IGV2ZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAgJ3Rvb2x0aXAtYXBwZW5kLXRvLWJvZHknOiB0cnVlfSk7XG4gICAgICAgICRjb21waWxlKGVsZW1lbnQpKCRzY29wZSk7XG4gICAgfTtcbiAgICAvKiBjb25maWcgb2JqZWN0ICovXG4gICAgJHNjb3BlLnVpQ29uZmlnID0ge1xuICAgICAgY2FsZW5kYXI6e1xuICAgICAgICBkZWZhdWx0VmlldzogJ2FnZW5kYURheScsXG4gICAgICAgIGhlaWdodDogNDUwLFxuICAgICAgICBlZGl0YWJsZTogdHJ1ZSxcbiAgICAgICAgaGVhZGVyOntcbiAgICAgICAgICBsZWZ0OiAndGl0bGUnLFxuICAgICAgICAgIGNlbnRlcjogJ2FnZW5kYURheSwgbW9udGgsIGFnZW5kYVdlZWsnLFxuICAgICAgICAgIHJpZ2h0OiAndG9kYXkgcHJldixuZXh0J1xuICAgICAgICB9LFxuICAgICAgICBldmVudENsaWNrOiAkc2NvcGUuYWxlcnRPbkV2ZW50Q2xpY2ssXG4gICAgICAgIGV2ZW50RHJvcDogJHNjb3BlLmFsZXJ0T25Ecm9wLFxuICAgICAgICBldmVudFJlc2l6ZTogJHNjb3BlLmFsZXJ0T25SZXNpemUsXG4gICAgICAgIGV2ZW50UmVuZGVyOiAkc2NvcGUuZXZlbnRSZW5kZXJcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgJHNjb3BlLmNoYW5nZUxhbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmKCRzY29wZS5jaGFuZ2VUbyA9PT0gJ0h1bmdhcmlhbicpe1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXMgPSBbXCJWYXPDoXJuYXBcIiwgXCJIw6l0ZsWRXCIsIFwiS2VkZFwiLCBcIlN6ZXJkYVwiLCBcIkNzw7x0w7ZydMO2a1wiLCBcIlDDqW50ZWtcIiwgXCJTem9tYmF0XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlZhc1wiLCBcIkjDqXRcIiwgXCJLZWRkXCIsIFwiU3plXCIsIFwiQ3PDvHRcIiwgXCJQw6luXCIsIFwiU3pvXCJdO1xuICAgICAgICAkc2NvcGUuY2hhbmdlVG89ICdFbmdsaXNoJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICRzY29wZS51aUNvbmZpZy5jYWxlbmRhci5kYXlOYW1lcyA9IFtcIlN1bmRheVwiLCBcIk1vbmRheVwiLCBcIlR1ZXNkYXlcIiwgXCJXZWRuZXNkYXlcIiwgXCJUaHVyc2RheVwiLCBcIkZyaWRheVwiLCBcIlNhdHVyZGF5XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlN1blwiLCBcIk1vblwiLCBcIlR1ZVwiLCBcIldlZFwiLCBcIlRodVwiLCBcIkZyaVwiLCBcIlNhdFwiXTtcbiAgICAgICAgJHNjb3BlLmNoYW5nZVRvID0gJ0h1bmdhcmlhbic7XG4gICAgICB9XG4gICAgfTtcbiAgICAvKiBldmVudCBzb3VyY2VzIGFycmF5Ki9cbiAgICAkc2NvcGUuZXZlbnRTb3VyY2VzID0gWyRzY29wZS5ldmVudHMsICRzY29wZS5ldmVudFNvdXJjZSwgJHNjb3BlLmV2ZW50c0ZdO1xuICAgICRzY29wZS5ldmVudFNvdXJjZXMyID0gWyRzY29wZS5jYWxFdmVudHNFeHQsICRzY29wZS5ldmVudHNGLCAkc2NvcGUuZXZlbnRzXTtcblxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSgnTGl2ZScpO1xufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uTGl2ZScsIHtcbiAgICAgICAgdXJsOiAnL2xpdmUnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0xpdmVDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTtcbiIsImFwcC5jb250cm9sbGVyKCdUcmFpbmVyQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSkge1xuXHQkc2NvcGUudHJhaW5lcnMgPSB0cmFpbmVycy5zb3J0KCk7XG59KVxuXG52YXIgdHJhaW5lcnMgPSBbXG5cdHtcblx0XHRuYW1lOiAnSm9obiBIYW5jb2NrJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDAvMTAwJyxcblx0XHRzcGVjaWFsaXR5OiAnQ2hhaXInXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2ViYXN0aWFuIExvZmdyZW4nLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEyMC8xMjAnLFxuXHRcdHNwZWNpYWxpdHk6ICdDaGFpcidcblx0XHRcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdEb25hbGQgVHJ1bXAnLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzExMC8xMTAnLFxuXHRcdHNwZWNpYWxpdHk6ICdBZXJvYmljcydcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdCaWxsIEhhZGVyJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDUvMTA1Jyxcblx0XHRzcGVjaWFsaXR5OiAnUGVyc29uYWwgVHJhaW5lcidcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdTYWx2YWRvciBEYWxpJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDEvMTAxJyxcblx0XHRzcGVjaWFsaXR5OiBcIlBoeXNpY2FsIFRoZXJhcGlzdFwiXG5cdH1cbl1cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5UcmFpbmVyJywge1xuICAgICAgICB1cmw6ICcvdHJhaW5lcnMnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vVHJhaW5lcnMvdHJhaW5lcnMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdUcmFpbmVyQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnbmF2YmFyJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge30sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdIb21lJywgc3RhdGU6ICdob21lJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdBYm91dCcsIHN0YXRlOiAnYWJvdXQnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ0RvY3VtZW50YXRpb24nLCBzdGF0ZTogJ2RvY3MnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ01lbWJlcnMgT25seScsIHN0YXRlOiAnbWVtYmVyc09ubHknLCBhdXRoOiB0cnVlIH1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuXG4gICAgICAgICAgICBzY29wZS5pc0xvZ2dlZEluID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5sb2dvdXQoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgcmVtb3ZlVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNldFVzZXIoKTtcblxuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzLCBzZXRVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MsIHJlbW92ZVVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIHJlbW92ZVVzZXIpO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgncmFuZG9HcmVldGluZycsIGZ1bmN0aW9uIChSYW5kb21HcmVldGluZ3MpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgICAgc2NvcGUuZ3JlZXRpbmcgPSBSYW5kb21HcmVldGluZ3MuZ2V0UmFuZG9tR3JlZXRpbmcoKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIl19
