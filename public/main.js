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
    "ImageUrl": "https://img.youtube.com/vi/m7zCDiiTBTk/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=m7zCDiiTBTk"
}, {
    "ID": 2,
    "Type": "Chair",
    "Title": "Priority One",
    "ImageUrl": "https://img.youtube.com/vi/OA55eMyB8S0/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=OA55eMyB8S0"
}, {
    "ID": 3,
    "Type": "Chair",
    "Title": "Low Impact Chair Aerobics",
    "ImageUrl": "https://img.youtube.com/vi/2AuLqYh4irI/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=2AuLqYh4irI"
}, {
    "ID": 4,
    "Type": "Chair",
    "Title": "Advanced Chair Exercise",
    "ImageUrl": "https://img.youtube.com/vi/OC9VbwyEG8U/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=OC9VbwyEG8U"
}, {
    "ID": 5,
    "Type": "Yoga",
    "Title": "Gentle Yoga",
    "ImageUrl": "https://img.youtube.com/vi/G8BsLlPE1m4/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=G8BsLlPE1m4"
}, {
    "ID": 6,
    "Type": "Yoga",
    "Title": "Gentle chair yoga routine",
    "ImageUrl": "https://img.youtube.com/vi/KEjiXtb2hRg/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=KEjiXtb2hRg"
}, {
    "ID": 7,
    "Type": "Yoga",
    "Title": "Wheelchair Yoga",
    "ImageUrl": "https://img.youtube.com/vi/FrVE1a2vgvA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=FrVE1a2vgvA"
}, {
    "ID": 8,
    "Type": "Yoga",
    "Title": "Energizing Chair Yoga",
    "ImageUrl": "https://img.youtube.com/vi/k4ST1j9PfrA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=k4ST1j9PfrA"
}, {
    "ID": 9,
    "Type": "Fall",
    "Title": "Balance Exercise",
    "ImageUrl": "https://img.youtube.com/vi/z-tUHuNPStw/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=z-tUHuNPStw"
}, {
    "ID": 10,
    "Type": "Fall",
    "Title": "Fall Prevention Exercises",
    "ImageUrl": "https://img.youtube.com/vi/NJDAoBoldr4/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=NJDAoBoldr4"
}, {
    "ID": 11,
    "Type": "Fall",
    "Title": "7 Balance Exercises",
    "ImageUrl": "https://img.youtube.com/vi/vGa5C1Qs8jA/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=vGa5C1Qs8jA"
}, {
    "ID": 12,
    "Type": "Fall",
    "Title": "Postural Stability",
    "ImageUrl": "https://img.youtube.com/vi/z6JoaJgofT8/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=z6JoaJgofT8"
}, {
    "ID": 13,
    "Type": "Tai Chi",
    "Title": "Easy Qigong",
    "ImageUrl": "https://img.youtube.com/vi/ApS1CLWO0BQ/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=ApS1CLWO0BQ"
}, {
    "ID": 14,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Beginners",
    "ImageUrl": "https://img.youtube.com/vi/VSd-cmOEnmw/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=VSd-cmOEnmw"
}, {
    "ID": 15,
    "Type": "Tai Chi",
    "Title": "Tai Chi for Seniors",
    "ImageUrl": "https://img.youtube.com/vi/WVKLJ8BuW8Q/default.jpg",
    "Youtube": "https://www.youtube.com/watch?v=WVKLJ8BuW8Q"
}, {
    "ID": 16,
    "Type": "Tai Chi",
    "Title": "Low Impact Tai Chi",
    "ImageUrl": "https://img.youtube.com/vi/ha1EF4YyvUw/default.jpg",
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
    $scope.findNearby = function () {
        $state.go('demo.nearby');
    };
    $scope.leaderboard = function () {
        $state.go('demo.Friend');
    };
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

var strangers = [];

function findName() {
    return 'Barbara';
}

function findDistance() {
    return Math.random() * 10 + ' Miles Away';
}

function findAge() {
    return Math.random() * 100 + ' Years Young';
}

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
    $scope.events = [{ title: 'Tai Chi', start: new Date(y, m, d, 9), url: 'http://google.com' }, { title: 'Aerobics with Richard', start: new Date(y, m, d, 11), end: new Date(y, m, d - 2) }, { id: 999, title: 'Chair Exercises with Clair', start: new Date(y, m, d, 14, 0), allDay: false }, { id: 999, title: 'Balance with John', start: new Date(y, m, d, 16, 0), allDay: false }, { title: 'Yoga with Peter', start: new Date(y, m, d, 19, 0), allDay: false }];
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

    $scope.eventClick = function (event) {
        if (event.url) {
            window.open(event.url);
            return false;
        }
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

app.config(function ($stateProvider) {

    $stateProvider.state('demo.nearby', {
        url: '/nearby',
        templateUrl: 'js/demo/Friends/nearby/nearby.html',
        controller: 'FriendsController'
    });
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImRvY3MvZG9jcy5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibG9naW4vbG9naW4uanMiLCJtZW1iZXJzLW9ubHkvbWVtYmVycy1vbmx5LmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9GdWxsc3RhY2tQaWNzLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9SYW5kb21HcmVldGluZ3MuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuY3RybC5qcyIsImRlbW8vRGVtYW5kL2RlbWFuZC5zdGF0ZS5qcyIsImRlbW8vRnJpZW5kcy9mcmllbmRzLmN0cmwuanMiLCJkZW1vL0ZyaWVuZHMvZnJpZW5kcy5zdGF0ZS5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5jdHJsLmpzIiwiZGVtby9MaXZlL2xpdmVDbGFzc2VzLnN0YXRlLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5jdHJsLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5zdGF0ZS5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuanMiLCJjb21tb24vZGlyZWN0aXZlcy9uYXZiYXIvbmF2YmFyLmpzIiwiZGVtby9GcmllbmRzL25lYXJieS9uZWFyYnkuc3RhdGUuanMiXSwibmFtZXMiOlsid2luZG93IiwiYXBwIiwiYW5ndWxhciIsIm1vZHVsZSIsImNvbmZpZyIsIiR1cmxSb3V0ZXJQcm92aWRlciIsIiRsb2NhdGlvblByb3ZpZGVyIiwiaHRtbDVNb2RlIiwib3RoZXJ3aXNlIiwid2hlbiIsImxvY2F0aW9uIiwicmVsb2FkIiwicnVuIiwiJHJvb3RTY29wZSIsIiR3aW5kb3ciLCIkbG9jYXRpb24iLCJnYSIsIiRvbiIsImV2ZW50IiwidG9TdGF0ZSIsInRvUGFyYW1zIiwiZnJvbVN0YXRlIiwiZnJvbVBhcmFtcyIsInRocm93bkVycm9yIiwiY29uc29sZSIsImluZm8iLCJlcnJvciIsInBhdGgiLCJBdXRoU2VydmljZSIsIiRzdGF0ZSIsImRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgiLCJzdGF0ZSIsImRhdGEiLCJhdXRoZW50aWNhdGUiLCJpc0F1dGhlbnRpY2F0ZWQiLCJwcmV2ZW50RGVmYXVsdCIsImdldExvZ2dlZEluVXNlciIsInRoZW4iLCJ1c2VyIiwiZ28iLCJuYW1lIiwiJHN0YXRlUHJvdmlkZXIiLCJ1cmwiLCJjb250cm9sbGVyIiwidGVtcGxhdGVVcmwiLCIkc2NvcGUiLCJGdWxsc3RhY2tQaWNzIiwiaW1hZ2VzIiwiXyIsInNodWZmbGUiLCJjaGFuZ2VDbGFzc0NhdGVnb3J5IiwiY2F0ZWdvcnkiLCJjbGFzc0NhdGVnb3J5IiwiRXJyb3IiLCJmYWN0b3J5IiwiaW8iLCJvcmlnaW4iLCJjb25zdGFudCIsImxvZ2luU3VjY2VzcyIsImxvZ2luRmFpbGVkIiwibG9nb3V0U3VjY2VzcyIsInNlc3Npb25UaW1lb3V0Iiwibm90QXV0aGVudGljYXRlZCIsIm5vdEF1dGhvcml6ZWQiLCIkcSIsIkFVVEhfRVZFTlRTIiwic3RhdHVzRGljdCIsInJlc3BvbnNlRXJyb3IiLCJyZXNwb25zZSIsIiRicm9hZGNhc3QiLCJzdGF0dXMiLCJyZWplY3QiLCIkaHR0cFByb3ZpZGVyIiwiaW50ZXJjZXB0b3JzIiwicHVzaCIsIiRpbmplY3RvciIsImdldCIsInNlcnZpY2UiLCIkaHR0cCIsIlNlc3Npb24iLCJvblN1Y2Nlc3NmdWxMb2dpbiIsImNyZWF0ZSIsImZyb21TZXJ2ZXIiLCJjYXRjaCIsImxvZ2luIiwiY3JlZGVudGlhbHMiLCJwb3N0IiwibWVzc2FnZSIsImxvZ291dCIsImRlc3Ryb3kiLCJzZWxmIiwiJHVpYk1vZGFsIiwib3Blbk1vZGFsIiwib3BlbiIsInNlbmRMb2dpbiIsImxvZ2luSW5mbyIsInRlbXBsYXRlIiwiU2VjcmV0U3Rhc2giLCJnZXRTdGFzaCIsInN0YXNoIiwiZ2V0UmFuZG9tRnJvbUFycmF5IiwiYXJyIiwiTWF0aCIsImZsb29yIiwicmFuZG9tIiwibGVuZ3RoIiwiZ3JlZXRpbmdzIiwiZ2V0UmFuZG9tR3JlZXRpbmciLCJjbGFzc2VzIiwic29ydEJ5VHlwZSIsInR5cGUiLCJmaWx0ZXIiLCJ2aWRlbyIsIlR5cGUiLCJmcmllbmRzIiwic29ydCIsImNvbXBhcmUiLCJmaW5kTmVhcmJ5IiwibGVhZGVyYm9hcmQiLCJhIiwiYiIsInNjb3JlIiwiaW1hZ2UiLCJzdHJhbmdlcnMiLCJmaW5kTmFtZSIsImZpbmREaXN0YW5jZSIsImZpbmRBZ2UiLCIkY29tcGlsZSIsInVpQ2FsZW5kYXJDb25maWciLCJkYXRlIiwiRGF0ZSIsImQiLCJnZXREYXRlIiwibSIsImdldE1vbnRoIiwieSIsImdldEZ1bGxZZWFyIiwiY2hhbmdlVG8iLCJldmVudFNvdXJjZSIsImNsYXNzTmFtZSIsImN1cnJlbnRUaW1lem9uZSIsImV2ZW50cyIsInRpdGxlIiwic3RhcnQiLCJlbmQiLCJpZCIsImFsbERheSIsImV2ZW50c0YiLCJ0aW1lem9uZSIsImNhbGxiYWNrIiwicyIsImdldFRpbWUiLCJlIiwiY2FsRXZlbnRzRXh0IiwiY29sb3IiLCJ0ZXh0Q29sb3IiLCJldmVudENsaWNrIiwiYWxlcnRPbkV2ZW50Q2xpY2siLCJqc0V2ZW50IiwidmlldyIsImFsZXJ0TWVzc2FnZSIsImFsZXJ0T25Ecm9wIiwiZGVsdGEiLCJyZXZlcnRGdW5jIiwidWkiLCJhbGVydE9uUmVzaXplIiwiYWRkUmVtb3ZlRXZlbnRTb3VyY2UiLCJzb3VyY2VzIiwic291cmNlIiwiY2FuQWRkIiwiZm9yRWFjaCIsInZhbHVlIiwia2V5Iiwic3BsaWNlIiwiYWRkRXZlbnQiLCJyZW1vdmUiLCJpbmRleCIsImNoYW5nZVZpZXciLCJjYWxlbmRhciIsImNhbGVuZGFycyIsImZ1bGxDYWxlbmRhciIsInJlbmRlckNhbGVuZGVyIiwiZXZlbnRSZW5kZXIiLCJlbGVtZW50IiwiYXR0ciIsInVpQ29uZmlnIiwiZGVmYXVsdFZpZXciLCJoZWlnaHQiLCJlZGl0YWJsZSIsImhlYWRlciIsImxlZnQiLCJjZW50ZXIiLCJyaWdodCIsImV2ZW50RHJvcCIsImV2ZW50UmVzaXplIiwiY2hhbmdlTGFuZyIsImRheU5hbWVzIiwiZGF5TmFtZXNTaG9ydCIsImV2ZW50U291cmNlcyIsImV2ZW50U291cmNlczIiLCJ0cmFpbmVycyIsInNwZWNpYWxpdHkiLCJkaXJlY3RpdmUiLCJyZXN0cmljdCIsIlJhbmRvbUdyZWV0aW5ncyIsImxpbmsiLCJzY29wZSIsImdyZWV0aW5nIiwiaXRlbXMiLCJsYWJlbCIsImF1dGgiLCJpc0xvZ2dlZEluIiwic2V0VXNlciIsInJlbW92ZVVzZXIiXSwibWFwcGluZ3MiOiJBQUFBOztBQUNBQSxPQUFBQyxHQUFBLEdBQUFDLFFBQUFDLE1BQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQSxhQUFBLEVBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxjQUFBLEVBQUEsV0FBQSxDQUFBLENBQUE7O0FBRUFGLElBQUFHLE1BQUEsQ0FBQSxVQUFBQyxrQkFBQSxFQUFBQyxpQkFBQSxFQUFBO0FBQ0E7QUFDQUEsc0JBQUFDLFNBQUEsQ0FBQSxJQUFBO0FBQ0E7QUFDQUYsdUJBQUFHLFNBQUEsQ0FBQSxHQUFBO0FBQ0E7QUFDQUgsdUJBQUFJLElBQUEsQ0FBQSxpQkFBQSxFQUFBLFlBQUE7QUFDQVQsZUFBQVUsUUFBQSxDQUFBQyxNQUFBO0FBQ0EsS0FGQTtBQUdBLENBVEE7O0FBV0E7QUFDQVYsSUFBQVcsR0FBQSxDQUFBLFVBQUFDLFVBQUEsRUFBQUMsT0FBQSxFQUFBQyxTQUFBLEVBQUE7QUFDQUQsWUFBQUUsRUFBQSxDQUFBLFFBQUEsRUFBQSxlQUFBLEVBQUEsTUFBQTtBQUNBSCxlQUFBSSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBQyxLQUFBLEVBQUFDLE9BQUEsRUFBQUMsUUFBQSxFQUFBQyxTQUFB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LEdBQUFBLElBQUE7QUFDQSxpQkFGQTtBQUdBLGFBSkE7O0FBTUEsZ0JBQUErSyxhQUFBLFNBQUFBLFVBQUEsR0FBQTtBQUNBUCxzQkFBQXhLLElBQUEsR0FBQSxJQUFBO0FBQ0EsYUFGQTs7QUFJQThLOztBQUVBdk0sdUJBQUFJLEdBQUEsQ0FBQWdELFlBQUFQLFlBQUEsRUFBQTBKLE9BQUE7QUFDQXZNLHVCQUFBSSxHQUFBLENBQUFnRCxZQUFBTCxhQUFBLEVBQUF5SixVQUFBO0FBQ0F4TSx1QkFBQUksR0FBQSxDQUFBZ0QsWUFBQUosY0FBQSxFQUFBd0osVUFBQTtBQUVBOztBQXpDQSxLQUFBO0FBNkNBLENBL0NBOztBQ0FBcE4sSUFBQUcsTUFBQSxDQUFBLFVBQUFxQyxjQUFBLEVBQUE7O0FBRUFBLG1CQUFBVixLQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0FXLGFBQUEsU0FEQTtBQUVBRSxxQkFBQSxvQ0FGQTtBQUdBRCxvQkFBQTtBQUhBLEtBQUE7QUFNQSxDQVJBIiwiZmlsZSI6Im1haW4uanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG53aW5kb3cuYXBwID0gYW5ndWxhci5tb2R1bGUoJ0NhcmVGYXJBcHAnLCBbJ2ZzYVByZUJ1aWx0JywndWkuY2FsZW5kYXInLCd1aS5yb3V0ZXInLCAndWkuYm9vdHN0cmFwJywgJ25nQW5pbWF0ZSddKTtcblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHVybFJvdXRlclByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlcikge1xuICAgIC8vIFRoaXMgdHVybnMgb2ZmIGhhc2hiYW5nIHVybHMgKC8jYWJvdXQpIGFuZCBjaGFuZ2VzIGl0IHRvIHNvbWV0aGluZyBub3JtYWwgKC9hYm91dClcbiAgICAkbG9jYXRpb25Qcm92aWRlci5odG1sNU1vZGUodHJ1ZSk7XG4gICAgLy8gSWYgd2UgZ28gdG8gYSBVUkwgdGhhdCB1aS1yb3V0ZXIgZG9lc24ndCBoYXZlIHJlZ2lzdGVyZWQsIGdvIHRvIHRoZSBcIi9cIiB1cmwuXG4gICAgJHVybFJvdXRlclByb3ZpZGVyLm90aGVyd2lzZSgnLycpO1xuICAgIC8vIFRyaWdnZXIgcGFnZSByZWZyZXNoIHdoZW4gYWNjZXNzaW5nIGFuIE9BdXRoIHJvdXRlXG4gICAgJHVybFJvdXRlclByb3ZpZGVyLndoZW4oJy9hdXRoLzpwcm92aWRlcicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0pO1xufSk7XG5cbi8vIFRoaXMgYXBwLnJ1biBpcyBmb3IgbGlzdGVuaW5nIHRvIGVycm9ycyBicm9hZGNhc3RlZCBieSB1aS1yb3V0ZXIsIHVzdWFsbHkgb3JpZ2luYXRpbmcgZnJvbSByZXNvbHZlc1xuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHdpbmRvdywgJGxvY2F0aW9uKSB7XG4gICAgJHdpbmRvdy5nYSgnY3JlYXRlJywgJ1VBLTg1NTU2ODQ2LTEnLCAnYXV0bycpO1xuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VFcnJvcicsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSwgZnJvbVBhcmFtcywgdGhyb3duRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5pbmZvKCdUaGUgZm9sbG93aW5nIGVycm9yIHdhcyB0aHJvd24gYnkgdWktcm91dGVyIHdoaWxlIHRyYW5zaXRpb25pbmcgdG8gc3RhdGUgXCIke3RvU3RhdGUubmFtZX1cIi4gVGhlIG9yaWdpbiBvZiB0aGlzIGVycm9yIGlzIHByb2JhYmx5IGEgcmVzb2x2ZSBmdW5jdGlvbjonKTtcbiAgICAgICAgY29uc29sZS5lcnJvcih0aHJvd25FcnJvcik7XG4gICAgfSk7XG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN1Y2Nlc3MnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUpIHtcbiAgICAgICAgJHdpbmRvdy5nYSgnc2VuZCcsICdwYWdldmlldycsICRsb2NhdGlvbi5wYXRoKCkpO1xuICAgIH0pO1xufSk7XG5cbi8vIFRoaXMgYXBwLnJ1biBpcyBmb3IgY29udHJvbGxpbmcgYWNjZXNzIHRvIHNwZWNpZmljIHN0YXRlcy5cbmFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUsICR3aW5kb3csICRsb2NhdGlvbikge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgICR3aW5kb3cuZ2EoJ3NlbmQnLCAncGFnZXZpZXdDbGljaycsICRsb2NhdGlvbi5wYXRoKCkpO1xuXG4gICAgICAgIGlmICghZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCh0b1N0YXRlKSkge1xuICAgICAgICAgICAgLy8gVGhlIGRlc3RpbmF0aW9uIHN0YXRlIGRvZXMgbm90IHJlcXVpcmUgYXV0aGVudGljYXRpb25cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkpIHtcbiAgICAgICAgICAgIC8vIFRoZSB1c2VyIGlzIGF1dGhlbnRpY2F0ZWQuXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FuY2VsIG5hdmlnYXRpbmcgdG8gbmV3IHN0YXRlLlxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIC8vIElmIGEgdXNlciBpcyByZXRyaWV2ZWQsIHRoZW4gcmVuYXZpZ2F0ZSB0byB0aGUgZGVzdGluYXRpb25cbiAgICAgICAgICAgIC8vICh0aGUgc2Vjb25kIHRpbWUsIEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpIHdpbGwgd29yaylcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgaWYgbm8gdXNlciBpcyBsb2dnZWQgaW4sIGdvIHRvIFwibG9naW5cIiBzdGF0ZS5cbiAgICAgICAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKHRvU3RhdGUubmFtZSwgdG9QYXJhbXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2xvZ2luJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgfSk7XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgIC8vIFJlZ2lzdGVyIG91ciAqYWJvdXQqIHN0YXRlLlxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdhYm91dCcsIHtcbiAgICAgICAgdXJsOiAnL2Fib3V0JyxcbiAgICAgICAgY29udHJvbGxlcjogJ0Fib3V0Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvYWJvdXQvYWJvdXQuaHRtbCdcbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdBYm91dENvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCBGdWxsc3RhY2tQaWNzKSB7XG5cbiAgICAvLyBJbWFnZXMgb2YgYmVhdXRpZnVsIEZ1bGxzdGFjayBwZW9wbGUuXG4gICAgJHNjb3BlLmltYWdlcyA9IF8uc2h1ZmZsZShGdWxsc3RhY2tQaWNzKTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignRGVtb0NvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0XG5cdCRzY29wZS5jaGFuZ2VDbGFzc0NhdGVnb3J5ID0gZnVuY3Rpb24gKGNhdGVnb3J5KSB7XG5cdFx0JHNjb3BlLmNsYXNzQ2F0ZWdvcnkgPSBjYXRlZ29yeTtcblx0XHQkc3RhdGUuZ28oJ2RlbW8uJytjYXRlZ29yeSlcblx0fVxuXG5cdCRzY29wZS5jaGFuZ2VDbGFzc0NhdGVnb3J5KCdMaXZlJyk7XG59KSIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtbycsIHtcbiAgICAgICAgdXJsOiAnL2RlbW8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vZGVtby5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0RlbW9Db250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkb2NzJywge1xuICAgICAgICB1cmw6ICcvZG9jcycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZG9jcy9kb2NzLmh0bWwnXG4gICAgfSk7XG59KTtcbiIsIihmdW5jdGlvbiAoKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBIb3BlIHlvdSBkaWRuJ3QgZm9yZ2V0IEFuZ3VsYXIhIER1aC1kb3kuXG4gICAgaWYgKCF3aW5kb3cuYW5ndWxhcikgdGhyb3cgbmV3IEVycm9yKCdJIGNhblxcJ3QgZmluZCBBbmd1bGFyIScpO1xuXG4gICAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdmc2FQcmVCdWlsdCcsIFtdKTtcblxuICAgIGFwcC5mYWN0b3J5KCdTb2NrZXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghd2luZG93LmlvKSB0aHJvdyBuZXcgRXJyb3IoJ3NvY2tldC5pbyBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuaW8od2luZG93LmxvY2F0aW9uLm9yaWdpbik7XG4gICAgfSk7XG5cbiAgICAvLyBBVVRIX0VWRU5UUyBpcyB1c2VkIHRocm91Z2hvdXQgb3VyIGFwcCB0b1xuICAgIC8vIGJyb2FkY2FzdCBhbmQgbGlzdGVuIGZyb20gYW5kIHRvIHRoZSAkcm9vdFNjb3BlXG4gICAgLy8gZm9yIGltcG9ydGFudCBldmVudHMgYWJvdXQgYXV0aGVudGljYXRpb24gZmxvdy5cbiAgICBhcHAuY29uc3RhbnQoJ0FVVEhfRVZFTlRTJywge1xuICAgICAgICBsb2dpblN1Y2Nlc3M6ICdhdXRoLWxvZ2luLXN1Y2Nlc3MnLFxuICAgICAgICBsb2dpbkZhaWxlZDogJ2F1dGgtbG9naW4tZmFpbGVkJyxcbiAgICAgICAgbG9nb3V0U3VjY2VzczogJ2F1dGgtbG9nb3V0LXN1Y2Nlc3MnLFxuICAgICAgICBzZXNzaW9uVGltZW91dDogJ2F1dGgtc2Vzc2lvbi10aW1lb3V0JyxcbiAgICAgICAgbm90QXV0aGVudGljYXRlZDogJ2F1dGgtbm90LWF1dGhlbnRpY2F0ZWQnLFxuICAgICAgICBub3RBdXRob3JpemVkOiAnYXV0aC1ub3QtYXV0aG9yaXplZCdcbiAgICB9KTtcblxuICAgIGFwcC5mYWN0b3J5KCdBdXRoSW50ZXJjZXB0b3InLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsIEFVVEhfRVZFTlRTKSB7XG4gICAgICAgIHZhciBzdGF0dXNEaWN0ID0ge1xuICAgICAgICAgICAgNDAxOiBBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLFxuICAgICAgICAgICAgNDAzOiBBVVRIX0VWRU5UUy5ub3RBdXRob3JpemVkLFxuICAgICAgICAgICAgNDE5OiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCxcbiAgICAgICAgICAgIDQ0MDogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0dXNEaWN0W3Jlc3BvbnNlLnN0YXR1c10sIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHJlc3BvbnNlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgYXBwLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlcikge1xuICAgICAgICAkaHR0cFByb3ZpZGVyLmludGVyY2VwdG9ycy5wdXNoKFtcbiAgICAgICAgICAgICckaW5qZWN0b3InLFxuICAgICAgICAgICAgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiAkaW5qZWN0b3IuZ2V0KCdBdXRoSW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSk7XG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnQXV0aFNlcnZpY2UnLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24sICRyb290U2NvcGUsIEFVVEhfRVZFTlRTLCAkcSkge1xuXG4gICAgICAgIGZ1bmN0aW9uIG9uU3VjY2Vzc2Z1bExvZ2luKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICB2YXIgdXNlciA9IHJlc3BvbnNlLmRhdGEudXNlcjtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKHVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcyk7XG4gICAgICAgICAgICByZXR1cm4gdXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZXMgdGhlIHNlc3Npb24gZmFjdG9yeSB0byBzZWUgaWYgYW5cbiAgICAgICAgLy8gYXV0aGVudGljYXRlZCB1c2VyIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLlxuICAgICAgICB0aGlzLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIVNlc3Npb24udXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmdldExvZ2dlZEluVXNlciA9IGZ1bmN0aW9uIChmcm9tU2VydmVyKSB7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBleGlzdHMsIHdlXG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIHVzZXIgYXR0YWNoZWQgdG8gdGhhdCBzZXNzaW9uXG4gICAgICAgICAgICAvLyB3aXRoIGEgcHJvbWlzZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuXG4gICAgICAgICAgICAvLyBhbHdheXMgaW50ZXJmYWNlIHdpdGggdGhpcyBtZXRob2QgYXN5bmNocm9ub3VzbHkuXG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHksIGlmIHRydWUgaXMgZ2l2ZW4gYXMgdGhlIGZyb21TZXJ2ZXIgcGFyYW1ldGVyLFxuICAgICAgICAgICAgLy8gdGhlbiB0aGlzIGNhY2hlZCB2YWx1ZSB3aWxsIG5vdCBiZSB1c2VkLlxuXG4gICAgICAgICAgICBpZiAodGhpcy5pc0F1dGhlbnRpY2F0ZWQoKSAmJiBmcm9tU2VydmVyICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLndoZW4oU2Vzc2lvbi51c2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWFrZSByZXF1ZXN0IEdFVCAvc2Vzc2lvbi5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSB1c2VyLCBjYWxsIG9uU3VjY2Vzc2Z1bExvZ2luIHdpdGggdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIDQwMSByZXNwb25zZSwgd2UgY2F0Y2ggaXQgYW5kIGluc3RlYWQgcmVzb2x2ZSB0byBudWxsLlxuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL3Nlc3Npb24nKS50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9naW4gPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9sb2dvdXQnKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBTZXNzaW9uLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9nb3V0U3VjY2Vzcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG4gICAgYXBwLnNlcnZpY2UoJ1Nlc3Npb24nLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMpIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IG51bGw7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxufSgpKTtcbiIsIlxuYXBwLmNvbnRyb2xsZXIoJ2dyaWRDdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgJHVpYk1vZGFsKSB7XHRcblxuXHQkc2NvcGUub3Blbk1vZGFsID0gZnVuY3Rpb24gKCkge1xuXHRcdCR1aWJNb2RhbC5vcGVuKHtcblx0XHRcdHRlbXBsYXRlVXJsOiAnanMvZ3JpZC9tb2RhbENvbnRlbnQuaHRtbCdcblx0XHR9KVxuXHR9XG59KVxuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgLy8gUmVnaXN0ZXIgb3VyICphYm91dCogc3RhdGUuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2xhbmRpbmcnLCB7XG4gICAgICAgIHVybDogJy8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2xhbmRpbmcvbGFuZGluZy5odG1sJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2xvZ2luJywge1xuICAgICAgICB1cmw6ICcvbG9naW4nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2xvZ2luL2xvZ2luLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnTG9naW5DdHJsJ1xuICAgIH0pO1xuXG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0xvZ2luQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUpIHtcblxuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAkc2NvcGUuc2VuZExvZ2luID0gZnVuY3Rpb24gKGxvZ2luSW5mbykge1xuXG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UubG9naW4obG9naW5JbmZvKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnaG9tZScpO1xuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSAnSW52YWxpZCBsb2dpbiBjcmVkZW50aWFscy4nO1xuICAgICAgICB9KTtcblxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdtZW1iZXJzT25seScsIHtcbiAgICAgICAgdXJsOiAnL21lbWJlcnMtYXJlYScsXG4gICAgICAgIHRlbXBsYXRlOiAnPGltZyBuZy1yZXBlYXQ9XCJpdGVtIGluIHN0YXNoXCIgd2lkdGg9XCIzMDBcIiBuZy1zcmM9XCJ7eyBpdGVtIH19XCIgLz4nLFxuICAgICAgICBjb250cm9sbGVyOiBmdW5jdGlvbiAoJHNjb3BlLCBTZWNyZXRTdGFzaCkge1xuICAgICAgICAgICAgU2VjcmV0U3Rhc2guZ2V0U3Rhc2goKS50aGVuKGZ1bmN0aW9uIChzdGFzaCkge1xuICAgICAgICAgICAgICAgICRzY29wZS5zdGFzaCA9IHN0YXNoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgZGF0YS5hdXRoZW50aWNhdGUgaXMgcmVhZCBieSBhbiBldmVudCBsaXN0ZW5lclxuICAgICAgICAvLyB0aGF0IGNvbnRyb2xzIGFjY2VzcyB0byB0aGlzIHN0YXRlLiBSZWZlciB0byBhcHAuanMuXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuZmFjdG9yeSgnU2VjcmV0U3Rhc2gnLCBmdW5jdGlvbiAoJGh0dHApIHtcblxuICAgIHZhciBnZXRTdGFzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2FwaS9tZW1iZXJzL3NlY3JldC1zdGFzaCcpLnRoZW4oZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldFN0YXNoOiBnZXRTdGFzaFxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmZhY3RvcnkoJ0Z1bGxzdGFja1BpY3MnLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CN2dCWHVsQ0FBQVhRY0UuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vZmJjZG4tc3Bob3Rvcy1jLWEuYWthbWFpaGQubmV0L2hwaG90b3MtYWsteGFwMS90MzEuMC04LzEwODYyNDUxXzEwMjA1NjIyOTkwMzU5MjQxXzgwMjcxNjg4NDMzMTI4NDExMzdfby5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItTEtVc2hJZ0FFeTlTSy5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I3OS1YN29DTUFBa3c3eS5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItVWo5Q09JSUFJRkFoMC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I2eUl5RmlDRUFBcWwxMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFLVQ3NWxXQUFBbXFxSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFdlpBZy1WQUFBazkzMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFZ05NZU9YSUFJZkRoSy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFUXlJRE5XZ0FBdTYwQi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NDRjNUNVFXOEFFMmxHSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBZVZ3NVNXb0FBQUxzai5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBYUpJUDdVa0FBbElHcy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBUU93OWxXRUFBWTlGbC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItT1FiVnJDTUFBTndJTS5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I5Yl9lcndDWUFBd1JjSi5wbmc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I1UFRkdm5DY0FFQWw0eC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I0cXdDMGlDWUFBbFBHaC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0IyYjMzdlJJVUFBOW8xRC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0J3cEl3cjFJVUFBdk8yXy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0JzU3NlQU5DWUFFT2hMdy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NKNHZMZnVVd0FBZGE0TC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJN3d6akVWRUFBT1BwUy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJZEh2VDJVc0FBbm5IVi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NHQ2lQX1lXWUFBbzc1Vi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJUzRKUElXSUFJMzdxdS5qcGc6bGFyZ2UnXG4gICAgXTtcbn0pO1xuIiwiYXBwLmZhY3RvcnkoJ1JhbmRvbUdyZWV0aW5ncycsIGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBnZXRSYW5kb21Gcm9tQXJyYXkgPSBmdW5jdGlvbiAoYXJyKSB7XG4gICAgICAgIHJldHVybiBhcnJbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXJyLmxlbmd0aCldO1xuICAgIH07XG5cbiAgICB2YXIgZ3JlZXRpbmdzID0gW1xuICAgICAgICAnSGVsbG8sIHdvcmxkIScsXG4gICAgICAgICdBdCBsb25nIGxhc3QsIEkgbGl2ZSEnLFxuICAgICAgICAnSGVsbG8sIHNpbXBsZSBodW1hbi4nLFxuICAgICAgICAnV2hhdCBhIGJlYXV0aWZ1bCBkYXkhJyxcbiAgICAgICAgJ0lcXCdtIGxpa2UgYW55IG90aGVyIHByb2plY3QsIGV4Y2VwdCB0aGF0IEkgYW0geW91cnMuIDopJyxcbiAgICAgICAgJ1RoaXMgZW1wdHkgc3RyaW5nIGlzIGZvciBMaW5kc2F5IExldmluZS4nLFxuICAgICAgICAn44GT44KT44Gr44Gh44Gv44CB44Om44O844K244O85qeY44CCJyxcbiAgICAgICAgJ1dlbGNvbWUuIFRvLiBXRUJTSVRFLicsXG4gICAgICAgICc6RCcsXG4gICAgICAgICdZZXMsIEkgdGhpbmsgd2VcXCd2ZSBtZXQgYmVmb3JlLicsXG4gICAgICAgICdHaW1tZSAzIG1pbnMuLi4gSSBqdXN0IGdyYWJiZWQgdGhpcyByZWFsbHkgZG9wZSBmcml0dGF0YScsXG4gICAgICAgICdJZiBDb29wZXIgY291bGQgb2ZmZXIgb25seSBvbmUgcGllY2Ugb2YgYWR2aWNlLCBpdCB3b3VsZCBiZSB0byBuZXZTUVVJUlJFTCEnLFxuICAgIF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBncmVldGluZ3M6IGdyZWV0aW5ncyxcbiAgICAgICAgZ2V0UmFuZG9tR3JlZXRpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRSYW5kb21Gcm9tQXJyYXkoZ3JlZXRpbmdzKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoJ0RlbWFuZENvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzO1xuICAkc2NvcGUuc29ydEJ5VHlwZSA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgaWYoIXR5cGUpICRzY29wZS5jbGFzc2VzID0gY2xhc3NlcztcbiAgICBlbHNlIHtcbiAgICAgICRzY29wZS5jbGFzc2VzID0gY2xhc3Nlcy5maWx0ZXIoZnVuY3Rpb24gKHZpZGVvKSB7XG4gICAgICAgIHJldHVybiB2aWRlby5UeXBlID09PSB0eXBlXG4gICAgICB9KVxuICAgICAgXG4gICAgfVxuICB9XG59KVxuXG52YXIgY2xhc3NlcyA9IFtcbiAge1xuICAgIFwiSURcIjogMSxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJBZXJvYmljIENoYWlyIFZpZGVvXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvbTd6Q0RpaVRCVGsvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PW03ekNEaWlUQlRrXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMixcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJQcmlvcml0eSBPbmVcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9PQTU1ZU15QjhTMC9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9T0E1NWVNeUI4UzBcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAzLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkxvdyBJbXBhY3QgQ2hhaXIgQWVyb2JpY3NcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS8yQXVMcVloNGlySS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9MkF1THFZaDRpcklcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA0LFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkFkdmFuY2VkIENoYWlyIEV4ZXJjaXNlXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvT0M5VmJ3eUVHOFUvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU9DOVZid3lFRzhVXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNSxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkdlbnRsZSBZb2dhXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvRzhCc0xsUEUxbTQvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUc4QnNMbFBFMW00XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNixcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkdlbnRsZSBjaGFpciB5b2dhIHJvdXRpbmVcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9LRWppWHRiMmhSZy9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9S0VqaVh0YjJoUmdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA3LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiV2hlZWxjaGFpciBZb2dhXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvRnJWRTFhMnZndkEvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUZyVkUxYTJ2Z3ZBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogOCxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIkVuZXJnaXppbmcgQ2hhaXIgWW9nYVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL2s0U1QxajlQZnJBL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1rNFNUMWo5UGZyQVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDksXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJCYWxhbmNlIEV4ZXJjaXNlXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvei10VUh1TlBTdHcvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXotdFVIdU5QU3R3XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTAsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJGYWxsIFByZXZlbnRpb24gRXhlcmNpc2VzXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvTkpEQW9Cb2xkcjQvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU5KREFvQm9sZHI0XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTEsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCI3IEJhbGFuY2UgRXhlcmNpc2VzXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvdkdhNUMxUXM4akEvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXZHYTVDMVFzOGpBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTIsXG4gICAgXCJUeXBlXCI6IFwiRmFsbFwiLFxuICAgIFwiVGl0bGVcIjogXCJQb3N0dXJhbCBTdGFiaWxpdHlcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS96NkpvYUpnb2ZUOC9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9ejZKb2FKZ29mVDhcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMyxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIkVhc3kgUWlnb25nXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvQXBTMUNMV08wQlEvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUFwUzFDTFdPMEJRXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTQsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJUYWkgQ2hpIGZvciBCZWdpbm5lcnNcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9WU2QtY21PRW5tdy9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9VlNkLWNtT0VubXdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNSxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIlRhaSBDaGkgZm9yIFNlbmlvcnNcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9XVktMSjhCdVc4US9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9V1ZLTEo4QnVXOFFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNixcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIkxvdyBJbXBhY3QgVGFpIENoaVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL2hhMUVGNFl5dlV3L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1oYTFFRjRZeXZVd1wiXG4gIH1cbl07XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uT24tRGVtYW5kJywge1xuICAgICAgICB1cmw6ICcvb24tZGVtYW5kJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL0RlbWFuZC9vbi1kZW1hbmQuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdEZW1hbmRDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29udHJvbGxlcignRnJpZW5kc0NvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLmZyaWVuZHMgPSBmcmllbmRzLnNvcnQoY29tcGFyZSk7XG5cdCRzY29wZS5maW5kTmVhcmJ5ID0gZnVuY3Rpb24gKCkge1xuXHRcdCRzdGF0ZS5nbygnZGVtby5uZWFyYnknKVxuXHR9XG5cdCRzY29wZS5sZWFkZXJib2FyZCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc3RhdGUuZ28oJ2RlbW8uRnJpZW5kJylcblx0fVxufSlcblxuZnVuY3Rpb24gY29tcGFyZShhLGIpIHtcbiAgaWYgKGEuc2NvcmUgPCBiLnNjb3JlKVxuICAgIHJldHVybiAxO1xuICBpZiAoYS5zY29yZSA+IGIuc2NvcmUpXG4gICAgcmV0dXJuIC0xO1xuICByZXR1cm4gMDtcbn1cblxudmFyIGZyaWVuZHMgPSBbXG5cdHtcblx0XHRuYW1lOiAnSm9obiBIYW5jb2NrJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDAvMTAwJyxcblx0XHRzY29yZTogMjBcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdTZWJhc3RpYW4gTG9mZ3JlbicsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTIwLzEyMCcsXG5cdFx0c2NvcmU6IDIwXG5cdFx0XG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnRG9uYWxkIFRydW1wJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMTAvMTEwJyxcblx0XHRzY29yZTogMzJcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdCaWxsIEhhZGVyJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDUvMTA1Jyxcblx0XHRzY29yZTogMjFcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdTYWx2YWRvciBEYWxpJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDEvMTAxJyxcblx0XHRzY29yZTogMjNcblx0fVxuXVxuXG52YXIgc3RyYW5nZXJzID0gW107XG5cbmZ1bmN0aW9uIGZpbmROYW1lICgpIHtcblx0cmV0dXJuICdCYXJiYXJhJztcbn1cblxuZnVuY3Rpb24gZmluZERpc3RhbmNlICgpIHtcblx0cmV0dXJuIE1hdGgucmFuZG9tKCkgKiAxMCArICcgTWlsZXMgQXdheSdcbn1cblxuZnVuY3Rpb24gZmluZEFnZSAoKSB7XG5cdHJldHVybiBNYXRoLnJhbmRvbSgpICogMTAwICsgJyBZZWFycyBZb3VuZydcbn1cblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLkZyaWVuZCcsIHtcbiAgICAgICAgdXJsOiAnL2ZyaWVuZHMnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRnJpZW5kcy9mcmllbmRzLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRnJpZW5kc0NvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb250cm9sbGVyKCdMaXZlQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRjb21waWxlLCB1aUNhbGVuZGFyQ29uZmlnKSB7XG5cdFxuXHR2YXIgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgdmFyIGQgPSBkYXRlLmdldERhdGUoKTtcbiAgICB2YXIgbSA9IGRhdGUuZ2V0TW9udGgoKTtcbiAgICB2YXIgeSA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcbiAgICBcbiAgICAkc2NvcGUuY2hhbmdlVG8gPSAnSHVuZ2FyaWFuJztcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBwdWxscyBmcm9tIGdvb2dsZS5jb20gKi9cbiAgICAkc2NvcGUuZXZlbnRTb3VyY2UgPSB7XG4gICAgICAgICAgICB1cmw6IFwiaHR0cDovL3d3dy5nb29nbGUuY29tL2NhbGVuZGFyL2ZlZWRzL3VzYV9fZW4lNDBob2xpZGF5LmNhbGVuZGFyLmdvb2dsZS5jb20vcHVibGljL2Jhc2ljXCIsXG4gICAgICAgICAgICBjbGFzc05hbWU6ICdnY2FsLWV2ZW50JywgICAgICAgICAgIC8vIGFuIG9wdGlvbiFcbiAgICAgICAgICAgIGN1cnJlbnRUaW1lem9uZTogJ0FtZXJpY2EvQ2hpY2FnbycgLy8gYW4gb3B0aW9uIVxuICAgIH07XG4gICAgLyogZXZlbnQgc291cmNlIHRoYXQgY29udGFpbnMgY3VzdG9tIGV2ZW50cyBvbiB0aGUgc2NvcGUgKi9cbiAgICAkc2NvcGUuZXZlbnRzID0gW1xuXHRcdFx0ICAgICAge3RpdGxlOiAnVGFpIENoaScsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQsIDkpLCB1cmw6J2h0dHA6Ly9nb29nbGUuY29tJ30sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdBZXJvYmljcyB3aXRoIFJpY2hhcmQnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMSksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkIC0gMil9LFxuXHRcdFx0ICAgICAge2lkOiA5OTksdGl0bGU6ICdDaGFpciBFeGVyY2lzZXMgd2l0aCBDbGFpcicsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQsIDE0LCAwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICAgIHtpZDogOTk5LHRpdGxlOiAnQmFsYW5jZSB3aXRoIEpvaG4nLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdZb2dhIHdpdGggUGV0ZXInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxOSwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgXTtcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBjYWxscyBhIGZ1bmN0aW9uIG9uIGV2ZXJ5IHZpZXcgc3dpdGNoICovXG4gICAgJHNjb3BlLmV2ZW50c0YgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgdGltZXpvbmUsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgcyA9IG5ldyBEYXRlKHN0YXJ0KS5nZXRUaW1lKCkgLyAxMDAwO1xuICAgICAgdmFyIGUgPSBuZXcgRGF0ZShlbmQpLmdldFRpbWUoKSAvIDEwMDA7XG4gICAgICB2YXIgbSA9IG5ldyBEYXRlKHN0YXJ0KS5nZXRNb250aCgpO1xuICAgICAgdmFyIGV2ZW50cyA9IFt7dGl0bGU6ICdGZWVkIE1lICcgKyBtLHN0YXJ0OiBzICsgKDUwMDAwKSxlbmQ6IHMgKyAoMTAwMDAwKSxhbGxEYXk6IGZhbHNlLCBjbGFzc05hbWU6IFsnY3VzdG9tRmVlZCddfV07XG4gICAgICBjYWxsYmFjayhldmVudHMpO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FsRXZlbnRzRXh0ID0ge1xuICAgICAgIGNvbG9yOiAnI2YwMCcsXG4gICAgICAgdGV4dENvbG9yOiAneWVsbG93JyxcbiAgICAgICBldmVudHM6IFsgXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0x1bmNoJyxzdGFydDogbmV3IERhdGUoeSwgbSwgZCwgMTIsIDApLGVuZDogbmV3IERhdGUoeSwgbSwgZCwgMTQsIDApLGFsbERheTogZmFsc2V9LFxuICAgICAgICAgIHt0eXBlOidwYXJ0eScsdGl0bGU6ICdMdW5jaCAyJyxzdGFydDogbmV3IERhdGUoeSwgbSwgZCwgMTIsIDApLGVuZDogbmV3IERhdGUoeSwgbSwgZCwgMTQsIDApLGFsbERheTogZmFsc2V9LFxuICAgICAgICAgIHt0eXBlOidwYXJ0eScsdGl0bGU6ICdDbGljayBmb3IgR29vZ2xlJyxzdGFydDogbmV3IERhdGUoeSwgbSwgMjgpLGVuZDogbmV3IERhdGUoeSwgbSwgMjkpLHVybDogJ2h0dHA6Ly9nb29nbGUuY29tLyd9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgJHNjb3BlLmV2ZW50Q2xpY2sgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgIGlmKGV2ZW50LnVybCkge1xuICAgICAgICB3aW5kb3cub3BlbihldmVudC51cmwpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8qIGFsZXJ0IG9uIGV2ZW50Q2xpY2sgKi9cbiAgICAkc2NvcGUuYWxlcnRPbkV2ZW50Q2xpY2sgPSBmdW5jdGlvbiggZGF0ZSwganNFdmVudCwgdmlldyl7XG4gICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoZGF0ZS50aXRsZSArICcgd2FzIGNsaWNrZWQgJyk7XG4gICAgfTtcbiAgICAvKiBhbGVydCBvbiBEcm9wICovXG4gICAgICRzY29wZS5hbGVydE9uRHJvcCA9IGZ1bmN0aW9uKGV2ZW50LCBkZWx0YSwgcmV2ZXJ0RnVuYywganNFdmVudCwgdWksIHZpZXcpe1xuICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoJ0V2ZW50IERyb3BlZCB0byBtYWtlIGRheURlbHRhICcgKyBkZWx0YSk7XG4gICAgfTtcbiAgICAvKiBhbGVydCBvbiBSZXNpemUgKi9cbiAgICAkc2NvcGUuYWxlcnRPblJlc2l6ZSA9IGZ1bmN0aW9uKGV2ZW50LCBkZWx0YSwgcmV2ZXJ0RnVuYywganNFdmVudCwgdWksIHZpZXcgKXtcbiAgICAgICAkc2NvcGUuYWxlcnRNZXNzYWdlID0gKCdFdmVudCBSZXNpemVkIHRvIG1ha2UgZGF5RGVsdGEgJyArIGRlbHRhKTtcbiAgICB9O1xuICAgIC8qIGFkZCBhbmQgcmVtb3ZlcyBhbiBldmVudCBzb3VyY2Ugb2YgY2hvaWNlICovXG4gICAgJHNjb3BlLmFkZFJlbW92ZUV2ZW50U291cmNlID0gZnVuY3Rpb24oc291cmNlcyxzb3VyY2UpIHtcbiAgICAgIHZhciBjYW5BZGQgPSAwO1xuICAgICAgYW5ndWxhci5mb3JFYWNoKHNvdXJjZXMsZnVuY3Rpb24odmFsdWUsIGtleSl7XG4gICAgICAgIGlmKHNvdXJjZXNba2V5XSA9PT0gc291cmNlKXtcbiAgICAgICAgICBzb3VyY2VzLnNwbGljZShrZXksMSk7XG4gICAgICAgICAgY2FuQWRkID0gMTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZihjYW5BZGQgPT09IDApe1xuICAgICAgICBzb3VyY2VzLnB1c2goc291cmNlKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIC8qIGFkZCBjdXN0b20gZXZlbnQqL1xuICAgICRzY29wZS5hZGRFdmVudCA9IGZ1bmN0aW9uKCkge1xuICAgICAgJHNjb3BlLmV2ZW50cy5wdXNoKHtcbiAgICAgICAgdGl0bGU6ICdPcGVuIFNlc2FtZScsXG4gICAgICAgIHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksXG4gICAgICAgIGVuZDogbmV3IERhdGUoeSwgbSwgMjkpLFxuICAgICAgICBjbGFzc05hbWU6IFsnb3BlblNlc2FtZSddXG4gICAgICB9KTtcbiAgICB9O1xuICAgIC8qIHJlbW92ZSBldmVudCAqL1xuICAgICRzY29wZS5yZW1vdmUgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgJHNjb3BlLmV2ZW50cy5zcGxpY2UoaW5kZXgsMSk7XG4gICAgfTtcbiAgICAvKiBDaGFuZ2UgVmlldyAqL1xuICAgICRzY29wZS5jaGFuZ2VWaWV3ID0gZnVuY3Rpb24odmlldyxjYWxlbmRhcikge1xuICAgICAgdWlDYWxlbmRhckNvbmZpZy5jYWxlbmRhcnNbY2FsZW5kYXJdLmZ1bGxDYWxlbmRhcignY2hhbmdlVmlldycsdmlldyk7XG4gICAgfTtcbiAgICAvKiBDaGFuZ2UgVmlldyAqL1xuICAgICRzY29wZS5yZW5kZXJDYWxlbmRlciA9IGZ1bmN0aW9uKGNhbGVuZGFyKSB7XG4gICAgICBpZih1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0pe1xuICAgICAgICB1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0uZnVsbENhbGVuZGFyKCdyZW5kZXInKTtcbiAgICAgIH1cbiAgICB9O1xuICAgICAvKiBSZW5kZXIgVG9vbHRpcCAqL1xuICAgICRzY29wZS5ldmVudFJlbmRlciA9IGZ1bmN0aW9uKCBldmVudCwgZWxlbWVudCwgdmlldyApIHsgXG4gICAgICAgIGVsZW1lbnQuYXR0cih7J3Rvb2x0aXAnOiBldmVudC50aXRsZSxcbiAgICAgICAgICAgICAgICAgICAgICd0b29sdGlwLWFwcGVuZC10by1ib2R5JzogdHJ1ZX0pO1xuICAgICAgICAkY29tcGlsZShlbGVtZW50KSgkc2NvcGUpO1xuICAgIH07XG4gICAgLyogY29uZmlnIG9iamVjdCAqL1xuICAgICRzY29wZS51aUNvbmZpZyA9IHtcbiAgICAgIGNhbGVuZGFyOntcbiAgICAgICAgZGVmYXVsdFZpZXc6ICdhZ2VuZGFEYXknLFxuICAgICAgICBoZWlnaHQ6IDQ1MCxcbiAgICAgICAgZWRpdGFibGU6IHRydWUsXG4gICAgICAgIGhlYWRlcjp7XG4gICAgICAgICAgbGVmdDogJ3RpdGxlJyxcbiAgICAgICAgICBjZW50ZXI6ICdhZ2VuZGFEYXksIG1vbnRoLCBhZ2VuZGFXZWVrJyxcbiAgICAgICAgICByaWdodDogJ3RvZGF5IHByZXYsbmV4dCdcbiAgICAgICAgfSxcbiAgICAgICAgZXZlbnRDbGljazogJHNjb3BlLmFsZXJ0T25FdmVudENsaWNrLFxuICAgICAgICBldmVudERyb3A6ICRzY29wZS5hbGVydE9uRHJvcCxcbiAgICAgICAgZXZlbnRSZXNpemU6ICRzY29wZS5hbGVydE9uUmVzaXplLFxuICAgICAgICBldmVudFJlbmRlcjogJHNjb3BlLmV2ZW50UmVuZGVyXG4gICAgICB9XG4gICAgfTtcblxuICAgICRzY29wZS5jaGFuZ2VMYW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZigkc2NvcGUuY2hhbmdlVG8gPT09ICdIdW5nYXJpYW4nKXtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzID0gW1wiVmFzw6FybmFwXCIsIFwiSMOpdGbFkVwiLCBcIktlZGRcIiwgXCJTemVyZGFcIiwgXCJDc8O8dMO2cnTDtmtcIiwgXCJQw6ludGVrXCIsIFwiU3pvbWJhdFwiXTtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzU2hvcnQgPSBbXCJWYXNcIiwgXCJIw6l0XCIsIFwiS2VkZFwiLCBcIlN6ZVwiLCBcIkNzw7x0XCIsIFwiUMOpblwiLCBcIlN6b1wiXTtcbiAgICAgICAgJHNjb3BlLmNoYW5nZVRvPSAnRW5nbGlzaCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXMgPSBbXCJTdW5kYXlcIiwgXCJNb25kYXlcIiwgXCJUdWVzZGF5XCIsIFwiV2VkbmVzZGF5XCIsIFwiVGh1cnNkYXlcIiwgXCJGcmlkYXlcIiwgXCJTYXR1cmRheVwiXTtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzU2hvcnQgPSBbXCJTdW5cIiwgXCJNb25cIiwgXCJUdWVcIiwgXCJXZWRcIiwgXCJUaHVcIiwgXCJGcmlcIiwgXCJTYXRcIl07XG4gICAgICAgICRzY29wZS5jaGFuZ2VUbyA9ICdIdW5nYXJpYW4nO1xuICAgICAgfVxuICAgIH07XG4gICAgLyogZXZlbnQgc291cmNlcyBhcnJheSovXG4gICAgJHNjb3BlLmV2ZW50U291cmNlcyA9IFskc2NvcGUuZXZlbnRzLCAkc2NvcGUuZXZlbnRTb3VyY2UsICRzY29wZS5ldmVudHNGXTtcbiAgICAkc2NvcGUuZXZlbnRTb3VyY2VzMiA9IFskc2NvcGUuY2FsRXZlbnRzRXh0LCAkc2NvcGUuZXZlbnRzRiwgJHNjb3BlLmV2ZW50c107XG5cblx0JHNjb3BlLmNoYW5nZUNsYXNzQ2F0ZWdvcnkoJ0xpdmUnKTtcbn0pIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLkxpdmUnLCB7XG4gICAgICAgIHVybDogJy9saXZlJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL0xpdmUvbGl2ZUNsYXNzZXMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdMaXZlQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignVHJhaW5lckNvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLnRyYWluZXJzID0gdHJhaW5lcnMuc29ydCgpO1xufSlcblxudmFyIHRyYWluZXJzID0gW1xuXHR7XG5cdFx0bmFtZTogJ0pvaG4gSGFuY29jaycsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAwLzEwMCcsXG5cdFx0c3BlY2lhbGl0eTogJ0NoYWlyJ1xuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NlYmFzdGlhbiBMb2ZncmVuJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMjAvMTIwJyxcblx0XHRzcGVjaWFsaXR5OiAnQ2hhaXInXG5cdFx0XG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnRG9uYWxkIFRydW1wJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMTAvMTEwJyxcblx0XHRzcGVjaWFsaXR5OiAnQWVyb2JpY3MnXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnQmlsbCBIYWRlcicsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTA1LzEwNScsXG5cdFx0c3BlY2lhbGl0eTogJ1BlcnNvbmFsIFRyYWluZXInXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2FsdmFkb3IgRGFsaScsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAxLzEwMScsXG5cdFx0c3BlY2lhbGl0eTogXCJQaHlzaWNhbCBUaGVyYXBpc3RcIlxuXHR9XG5dXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uVHJhaW5lcicsIHtcbiAgICAgICAgdXJsOiAnL3RyYWluZXJzJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL1RyYWluZXJzL3RyYWluZXJzLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnVHJhaW5lckNvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ2Z1bGxzdGFja0xvZ28nLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9jb21tb24vZGlyZWN0aXZlcy9mdWxsc3RhY2stbG9nby9mdWxsc3RhY2stbG9nby5odG1sJ1xuICAgIH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ3JhbmRvR3JlZXRpbmcnLCBmdW5jdGlvbiAoUmFuZG9tR3JlZXRpbmdzKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3JhbmRvLWdyZWV0aW5nL3JhbmRvLWdyZWV0aW5nLmh0bWwnLFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHNjb3BlLmdyZWV0aW5nID0gUmFuZG9tR3JlZXRpbmdzLmdldFJhbmRvbUdyZWV0aW5nKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHt9LFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgICAgICAgICBzY29wZS5pdGVtcyA9IFtcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnSG9tZScsIHN0YXRlOiAnaG9tZScgfSxcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnQWJvdXQnLCBzdGF0ZTogJ2Fib3V0JyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEb2N1bWVudGF0aW9uJywgc3RhdGU6ICdkb2NzJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdNZW1iZXJzIE9ubHknLCBzdGF0ZTogJ21lbWJlcnNPbmx5JywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICB9XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5uZWFyYnknLCB7XG4gICAgICAgIHVybDogJy9uZWFyYnknLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRnJpZW5kcy9uZWFyYnkvbmVhcmJ5Lmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRnJpZW5kc0NvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyJdfQ==
