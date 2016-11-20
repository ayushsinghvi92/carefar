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
    $scope.events = [{ title: 'Tai Chi', start: new Date(y, m, d), url: 'http://google.com' }, { title: 'Aerobics with Richard', start: new Date(y, m, d), end: new Date(y, m, d - 2) }, { id: 999, title: 'Chair Exercises with Clair', start: new Date(y, m, d, 16, 0), allDay: false }, { id: 999, title: 'Balance with John', start: new Date(y, m, d, 16, 0), allDay: false }, { title: 'Yoga with Peter', start: new Date(y, m, d, 19, 0), end: new Date(y, m, d + 1, 22, 30), allDay: false }];
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

app.config(function ($stateProvider) {

    $stateProvider.state('demo.nearby', {
        url: '/nearby',
        templateUrl: 'js/demo/Friends/nearby/nearby.html',
        controller: 'FriendsController'
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImRvY3MvZG9jcy5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibG9naW4vbG9naW4uanMiLCJtZW1iZXJzLW9ubHkvbWVtYmVycy1vbmx5LmpzIiwiZGVtby9EZW1hbmQvZGVtYW5kLmN0cmwuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuc3RhdGUuanMiLCJkZW1vL0ZyaWVuZHMvZnJpZW5kcy5jdHJsLmpzIiwiZGVtby9GcmllbmRzL2ZyaWVuZHMuc3RhdGUuanMiLCJkZW1vL0xpdmUvbGl2ZUNsYXNzZXMuY3RybC5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5zdGF0ZS5qcyIsImRlbW8vVHJhaW5lcnMvdHJhaW5lcnMuY3RybC5qcyIsImRlbW8vVHJhaW5lcnMvdHJhaW5lcnMuc3RhdGUuanMiLCJjb21tb24vZmFjdG9yaWVzL0Z1bGxzdGFja1BpY3MuanMiLCJjb21tb24vZmFjdG9yaWVzL1JhbmRvbUdyZWV0aW5ncy5qcyIsImRlbW8vRnJpZW5kcy9uZWFyYnkvbmVhcmJ5LnN0YXRlLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uanMiLCJjb21tb24vZGlyZWN0aXZlcy9yYW5kby1ncmVldGluZy9yYW5kby1ncmVldGluZy5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuanMiXSwibmFtZXMiOlsid2luZG93IiwiYXBwIiwiYW5ndWxhciIsIm1vZHVsZSIsImNvbmZpZyIsIiR1cmxSb3V0ZXJQcm92aWRlciIsIiRsb2NhdGlvblByb3ZpZGVyIiwiaHRtbDVNb2RlIiwib3RoZXJ3aXNlIiwid2hlbiIsImxvY2F0aW9uIiwicmVsb2FkIiwicnVuIiwiJHJvb3RTY29wZSIsIiR3aW5kb3ciLCIkbG9jYXRpb24iLCJnYSIsIiRvbiIsImV2ZW50IiwidG9TdGF0ZSIsInRvUGFyYW1zIiwiZnJvbVN0YXRlIiwiZnJvbVBhcmFtcyIsInRocm93bkVycm9yIiwiY29uc29sZSIsImluZm8iLCJlcnJvciIsInBhdGgiLCJBdXRoU2VydmljZSIsIiRzdGF0ZSIsImRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgiLCJzdGF0ZSIsImRhdGEiLCJhdXRoZW50aWNhdGUiLCJpc0F1dGhlbnRpY2F0ZWQiLCJwcmV2ZW50RGVmYXVsdCIsImdldExvZ2dlZEluVXNlciIsInRoZW4iLCJ1c2VyIiwiZ28iLCJuYW1lIiwiJHN0YXRlUHJvdmlkZXIiLCJ1cmwiLCJjb250cm9sbGVyIiwidGVtcGxhdGVVcmwiLCIkc2NvcGUiLCJGdWxsc3RhY2tQaWNzIiwiaW1hZ2VzIiwiXyIsInNodWZmbGUiLCJjaGFuZ2VDbGFzc0NhdGVnb3J5IiwiY2F0ZWdvcnkiLCJjbGFzc0NhdGVnb3J5IiwiRXJyb3IiLCJmYWN0b3J5IiwiaW8iLCJvcmlnaW4iLCJjb25zdGFudCIsImxvZ2luU3VjY2VzcyIsImxvZ2luRmFpbGVkIiwibG9nb3V0U3VjY2VzcyIsInNlc3Npb25UaW1lb3V0Iiwibm90QXV0aGVudGljYXRlZCIsIm5vdEF1dGhvcml6ZWQiLCIkcSIsIkFVVEhfRVZFTlRTIiwic3RhdHVzRGljdCIsInJlc3BvbnNlRXJyb3IiLCJyZXNwb25zZSIsIiRicm9hZGNhc3QiLCJzdGF0dXMiLCJyZWplY3QiLCIkaHR0cFByb3ZpZGVyIiwiaW50ZXJjZXB0b3JzIiwicHVzaCIsIiRpbmplY3RvciIsImdldCIsInNlcnZpY2UiLCIkaHR0cCIsIlNlc3Npb24iLCJvblN1Y2Nlc3NmdWxMb2dpbiIsImNyZWF0ZSIsImZyb21TZXJ2ZXIiLCJjYXRjaCIsImxvZ2luIiwiY3JlZGVudGlhbHMiLCJwb3N0IiwibWVzc2FnZSIsImxvZ291dCIsImRlc3Ryb3kiLCJzZWxmIiwiJHVpYk1vZGFsIiwib3Blbk1vZGFsIiwib3BlbiIsInNlbmRMb2dpbiIsImxvZ2luSW5mbyIsInRlbXBsYXRlIiwiU2VjcmV0U3Rhc2giLCJnZXRTdGFzaCIsInN0YXNoIiwiY2xhc3NlcyIsInNvcnRCeVR5cGUiLCJ0eXBlIiwiZmlsdGVyIiwidmlkZW8iLCJUeXBlIiwiZnJpZW5kcyIsInNvcnQiLCJjb21wYXJlIiwiZmluZE5lYXJieSIsImxlYWRlcmJvYXJkIiwiYSIsImIiLCJzY29yZSIsImltYWdlIiwic3RyYW5nZXJzIiwiZmluZE5hbWUiLCJmaW5kRGlzdGFuY2UiLCJNYXRoIiwicmFuZG9tIiwiZmluZEFnZSIsIiRjb21waWxlIiwidWlDYWxlbmRhckNvbmZpZyIsImRhdGUiLCJEYXRlIiwiZCIsImdldERhdGUiLCJtIiwiZ2V0TW9udGgiLCJ5IiwiZ2V0RnVsbFllYXIiLCJjaGFuZ2VUbyIsImV2ZW50U291cmNlIiwiY2xhc3NOYW1lIiwiY3VycmVudFRpbWV6b25lIiwiZXZlbnRzIiwidGl0bGUiLCJzdGFydCIsImVuZCIsImlkIiwiYWxsRGF5IiwiZXZlbnRzRiIsInRpbWV6b25lIiwiY2FsbGJhY2siLCJzIiwiZ2V0VGltZSIsImUiLCJjYWxFdmVudHNFeHQiLCJjb2xvciIsInRleHRDb2xvciIsImV2ZW50Q2xpY2siLCJhbGVydE9uRXZlbnRDbGljayIsImpzRXZlbnQiLCJ2aWV3IiwiYWxlcnRNZXNzYWdlIiwiYWxlcnRPbkRyb3AiLCJkZWx0YSIsInJldmVydEZ1bmMiLCJ1aSIsImFsZXJ0T25SZXNpemUiLCJhZGRSZW1vdmVFdmVudFNvdXJjZSIsInNvdXJjZXMiLCJzb3VyY2UiLCJjYW5BZGQiLCJmb3JFYWNoIiwidmFsdWUiLCJrZXkiLCJzcGxpY2UiLCJhZGRFdmVudCIsInJlbW92ZSIsImluZGV4IiwiY2hhbmdlVmlldyIsImNhbGVuZGFyIiwiY2FsZW5kYXJzIiwiZnVsbENhbGVuZGFyIiwicmVuZGVyQ2FsZW5kZXIiLCJldmVudFJlbmRlciIsImVsZW1lbnQiLCJhdHRyIiwidWlDb25maWciLCJkZWZhdWx0VmlldyIsImhlaWdodCIsImVkaXRhYmxlIiwiaGVhZGVyIiwibGVmdCIsImNlbnRlciIsInJpZ2h0IiwiZXZlbnREcm9wIiwiZXZlbnRSZXNpemUiLCJjaGFuZ2VMYW5nIiwiZGF5TmFtZXMiLCJkYXlOYW1lc1Nob3J0IiwiZXZlbnRTb3VyY2VzIiwiZXZlbnRTb3VyY2VzMiIsInRyYWluZXJzIiwic3BlY2lhbGl0eSIsImdldFJhbmRvbUZyb21BcnJheSIsImFyciIsImZsb29yIiwibGVuZ3RoIiwiZ3JlZXRpbmdzIiwiZ2V0UmFuZG9tR3JlZXRpbmciLCJkaXJlY3RpdmUiLCJyZXN0cmljdCIsIlJhbmRvbUdyZWV0aW5ncyIsImxpbmsiLCJzY29wZSIsImdyZWV0aW5nIiwiaXRlbXMiLCJsYWJlbCIsImF1dGgiLCJpc0xvZ2dlZEluIiwic2V0VXNlciIsInJlbW92ZVVzZXIiXSwibWFwcGluZ3MiOiJBQUFBOztBQUNBQSxPQUFBQyxHQUFBLEdBQUFDLFFBQUFDLE1BQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQSxhQUFBLEVBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxjQUFBLEVBQUEsV0FBQSxDQUFBLENBQUE7O0FBRUFGLElBQUFHLE1BQUEsQ0FBQSxVQUFBQyxrQkFBQSxFQUFBQyxpQkFBQSxFQUFBO0FBQ0E7QUFDQUEsc0JBQUFDLFNBQUEsQ0FBQSxJQUFBO0FBQ0E7QUFDQUYsdUJBQUFHLFNBQUEsQ0FBQSxHQUFBO0FBQ0E7QUFDQUgsdUJBQUFJLElBQUEsQ0FBQSxpQkFBQSxFQUFBLFlBQUE7QUFDQVQsZUFBQVUsUUFBQSxDQUFBQyxNQUFBO0FBQ0EsS0FGQTtBQUdBLENBVEE7O0FBV0E7QUFDQVYsSUFBQVcsR0FBQSxDQUFBLFVBQUFDLFVBQUEsRUFBQUMsT0FBQSxFQUFBQyxTQUFBLEVBQUE7QUFDQUQsWUFBQUUsRUFBQSxDQUFBLFFBQUEsRUFBQSxlQUFBLEVBQUEsTUFBQTtBQUNBSCxlQUFBSSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBQyxLQUFBLEVBQUFDLE9BQUEsRUFBQUMsUUFBQSxFQUFBQyxTQUFB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QyxPQUFBLElBQUFiLElBQUEsQ0FBQUssQ0FBQSxFQUFBRixDQUFBLEVBQUFGLENBQUEsQ0FBQSxFQUFBbkYsS0FBQSxtQkFBQSxFQURBLEVBRUEsRUFBQThGLE9BQUEsdUJBQUEsRUFBQUMsT0FBQSxJQUFBYixJQUFBLENBQUFLLENBQUEsRUFBQUYsQ0FBQSxFQUFBRixDQUFBLENBQUEsRUFBQWEsS0FBQSxJQUFBZCxJQUFBLENBQUFLLENBQUEsRUFBQUYsQ0FBQSxFQUFBRixJQUFBLENBQUEsQ0FBQSxFQUZBLEVBR0EsRUFBQWMsSUFBQSxHQUFBLEVBQUFILE9BQUEsNEJBQUEsRUFBQUMsT0FBQSxJQUFBYixJQUFBLENBQUFLLENBQUEsRUFBQUYsQ0FBQSxFQUFBRixDQUFBLEVBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQSxFQUFBZSxRQUFBLEtBQUEsRUFIQSxFQUlBLEVBQUFELElBQUEsR0FBQSxFQUFBSCxPQUFBLG1CQUFBLEVBQUFDLE9BQUEsSUFBQWIsSUFBQSxDQUFBSyxDQUFBLEVBQUFGLENBQUEsRUFBQUYsQ0FBQSxFQUFBLEVBQUEsRUFBQSxDQUFBLENBQUEsRUFBQWUsUUFBQSxLQUFBLEVBSkEsRUFLQSxFQUFBSixPQUFBLGlCQUFBLEVBQUFDLE9BQUEsSUFBQWIsSUFBQSxDQUFBSyxDQUFBLEVBQUFGLENBQUEsRUFBQUYsQ0FBQSxFQUFBLEVBQUEsRUFBQSxDQUFBLENBQUEsRUFBQWEsS0FBQSxJQUFBZCxJQUFBLENBQUFLLENBQUEsRUFBQUYsQ0FBQSxFQUFBRixJQUFBLENBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxDQUFBLEVBQUFlLFFBQUEsS0FBQSxFQUxBLENBQUE7QUFPQTtBQUNBL0YsV0FBQWdHLE9BQUEsR0FBQSxVQUFBSixLQUFBLEVBQUFDLEdBQUEsRUFBQUksUUFBQSxFQUFBQyxRQUFBLEVBQUE7QUFDQSxZQUFBQyxJQUFBLElBQUFwQixJQUFBLENBQUFhLEtBQUEsRUFBQVEsT0FBQSxLQUFBLElBQUE7QUFDQSxZQUFBQyxJQUFBLElBQUF0QixJQUFBLENBQUFjLEdBQUEs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QUFBLFlBQUE7QUFDQTVELDRCQUFBNEQsTUFBQSxHQUFBbkQsSUFBQSxDQUFBLFlBQUE7QUFDQVIsMkJBQUFVLEVBQUEsQ0FBQSxNQUFBO0FBQ0EsaUJBRkE7QUFHQSxhQUpBOztBQU1BLGdCQUFBNkssVUFBQSxTQUFBQSxPQUFBLEdBQUE7QUFDQXhMLDRCQUFBUSxlQUFBLEdBQUFDLElBQUEsQ0FBQSxVQUFBQyxJQUFBLEVBQUE7QUFDQXdLLDBCQUFBeEssSUFBQSxHQUFBQSxJQUFBO0FBQ0EsaUJBRkE7QUFHQSxhQUpBOztBQU1BLGdCQUFBK0ssYUFBQSxTQUFBQSxVQUFBLEdBQUE7QUFDQVAsc0JBQUF4SyxJQUFBLEdBQUEsSUFBQTtBQUNBLGFBRkE7O0FBSUE4Szs7QUFFQXZNLHVCQUFBSSxHQUFBLENBQUFnRCxZQUFBUCxZQUFBLEVBQUEwSixPQUFBO0FBQ0F2TSx1QkFBQUksR0FBQSxDQUFBZ0QsWUFBQUwsYUFBQSxFQUFBeUosVUFBQTtBQUNBeE0sdUJBQUFJLEdBQUEsQ0FBQWdELFlBQUFKLGNBQUEsRUFBQXdKLFVBQUE7QUFFQTs7QUF6Q0EsS0FBQTtBQTZDQSxDQS9DQSIsImZpbGUiOiJtYWluLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xud2luZG93LmFwcCA9IGFuZ3VsYXIubW9kdWxlKCdDYXJlRmFyQXBwJywgWydmc2FQcmVCdWlsdCcsJ3VpLmNhbGVuZGFyJywndWkucm91dGVyJywgJ3VpLmJvb3RzdHJhcCcsICduZ0FuaW1hdGUnXSk7XG5cbmFwcC5jb25maWcoZnVuY3Rpb24gKCR1cmxSb3V0ZXJQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcbiAgICAvLyBUaGlzIHR1cm5zIG9mZiBoYXNoYmFuZyB1cmxzICgvI2Fib3V0KSBhbmQgY2hhbmdlcyBpdCB0byBzb21ldGhpbmcgbm9ybWFsICgvYWJvdXQpXG4gICAgJGxvY2F0aW9uUHJvdmlkZXIuaHRtbDVNb2RlKHRydWUpO1xuICAgIC8vIElmIHdlIGdvIHRvIGEgVVJMIHRoYXQgdWktcm91dGVyIGRvZXNuJ3QgaGF2ZSByZWdpc3RlcmVkLCBnbyB0byB0aGUgXCIvXCIgdXJsLlxuICAgICR1cmxSb3V0ZXJQcm92aWRlci5vdGhlcndpc2UoJy8nKTtcbiAgICAvLyBUcmlnZ2VyIHBhZ2UgcmVmcmVzaCB3aGVuIGFjY2Vzc2luZyBhbiBPQXV0aCByb3V0ZVxuICAgICR1cmxSb3V0ZXJQcm92aWRlci53aGVuKCcvYXV0aC86cHJvdmlkZXInLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9KTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGxpc3RlbmluZyB0byBlcnJvcnMgYnJvYWRjYXN0ZWQgYnkgdWktcm91dGVyLCB1c3VhbGx5IG9yaWdpbmF0aW5nIGZyb20gcmVzb2x2ZXNcbmFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUsICR3aW5kb3csICRsb2NhdGlvbikge1xuICAgICR3aW5kb3cuZ2EoJ2NyZWF0ZScsICdVQS04NTU1Njg0Ni0xJywgJ2F1dG8nKTtcbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlRXJyb3InLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zLCBmcm9tU3RhdGUsIGZyb21QYXJhbXMsIHRocm93bkVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVGhlIGZvbGxvd2luZyBlcnJvciB3YXMgdGhyb3duIGJ5IHVpLXJvdXRlciB3aGlsZSB0cmFuc2l0aW9uaW5nIHRvIHN0YXRlIFwiJHt0b1N0YXRlLm5hbWV9XCIuIFRoZSBvcmlnaW4gb2YgdGhpcyBlcnJvciBpcyBwcm9iYWJseSBhIHJlc29sdmUgZnVuY3Rpb246Jyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IodGhyb3duRXJyb3IpO1xuICAgIH0pO1xuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlKSB7XG4gICAgICAgICR3aW5kb3cuZ2EoJ3NlbmQnLCAncGFnZXZpZXcnLCAkbG9jYXRpb24ucGF0aCgpKTtcbiAgICB9KTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGNvbnRyb2xsaW5nIGFjY2VzcyB0byBzcGVjaWZpYyBzdGF0ZXMuXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCAkd2luZG93LCAkbG9jYXRpb24pIHtcblxuICAgIC8vIFRoZSBnaXZlbiBzdGF0ZSByZXF1aXJlcyBhbiBhdXRoZW50aWNhdGVkIHVzZXIuXG4gICAgdmFyIGRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGggPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlLmRhdGEgJiYgc3RhdGUuZGF0YS5hdXRoZW50aWNhdGU7XG4gICAgfTtcblxuICAgIC8vICRzdGF0ZUNoYW5nZVN0YXJ0IGlzIGFuIGV2ZW50IGZpcmVkXG4gICAgLy8gd2hlbmV2ZXIgdGhlIHByb2Nlc3Mgb2YgY2hhbmdpbmcgYSBzdGF0ZSBiZWdpbnMuXG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcykge1xuXG4gICAgICAgICAkd2luZG93LmdhKCdzZW5kJywgJ3BhZ2V2aWV3Q2xpY2snLCAkbG9jYXRpb24ucGF0aCgpKTtcblxuICAgICAgICBpZiAoIWRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgodG9TdGF0ZSkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBkb2VzIG5vdCByZXF1aXJlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBpcyBhdXRoZW50aWNhdGVkLlxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbmNlbCBuYXZpZ2F0aW5nIHRvIG5ldyBzdGF0ZS5cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAvLyBJZiBhIHVzZXIgaXMgcmV0cmlldmVkLCB0aGVuIHJlbmF2aWdhdGUgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAgICAgICAgICAvLyAodGhlIHNlY29uZCB0aW1lLCBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSB3aWxsIHdvcmspXG4gICAgICAgICAgICAvLyBvdGhlcndpc2UsIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLCBnbyB0byBcImxvZ2luXCIgc3RhdGUuXG4gICAgICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbyh0b1N0YXRlLm5hbWUsIHRvUGFyYW1zKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdsb2dpbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH0pO1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAvLyBSZWdpc3RlciBvdXIgKmFib3V0KiBzdGF0ZS5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnYWJvdXQnLCB7XG4gICAgICAgIHVybDogJy9hYm91dCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdBYm91dENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2Fib3V0L2Fib3V0Lmh0bWwnXG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignQWJvdXRDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgRnVsbHN0YWNrUGljcykge1xuXG4gICAgLy8gSW1hZ2VzIG9mIGJlYXV0aWZ1bCBGdWxsc3RhY2sgcGVvcGxlLlxuICAgICRzY29wZS5pbWFnZXMgPSBfLnNodWZmbGUoRnVsbHN0YWNrUGljcyk7XG5cbn0pO1xuIiwiYXBwLmNvbnRyb2xsZXIoJ0RlbW9Db250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdFxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSA9IGZ1bmN0aW9uIChjYXRlZ29yeSkge1xuXHRcdCRzY29wZS5jbGFzc0NhdGVnb3J5ID0gY2F0ZWdvcnk7XG5cdFx0JHN0YXRlLmdvKCdkZW1vLicrY2F0ZWdvcnkpXG5cdH1cblxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSgnTGl2ZScpO1xufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8nLCB7XG4gICAgICAgIHVybDogJy9kZW1vJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL2RlbW8uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdEZW1vQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZG9jcycsIHtcbiAgICAgICAgdXJsOiAnL2RvY3MnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RvY3MvZG9jcy5odG1sJ1xuICAgIH0pO1xufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuXG4gICAgYXBwLnNlcnZpY2UoJ0F1dGhTZXJ2aWNlJywgZnVuY3Rpb24gKCRodHRwLCBTZXNzaW9uLCAkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUywgJHEpIHtcblxuICAgICAgICBmdW5jdGlvbiBvblN1Y2Nlc3NmdWxMb2dpbihyZXNwb25zZSkge1xuICAgICAgICAgICAgdmFyIHVzZXIgPSByZXNwb25zZS5kYXRhLnVzZXI7XG4gICAgICAgICAgICBTZXNzaW9uLmNyZWF0ZSh1c2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMudXNlciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5jcmVhdGUgPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0oKSk7XG4iLCJcbmFwcC5jb250cm9sbGVyKCdncmlkQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsICR1aWJNb2RhbCkge1x0XG5cblx0JHNjb3BlLm9wZW5Nb2RhbCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkdWliTW9kYWwub3Blbih7XG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL2dyaWQvbW9kYWxDb250ZW50Lmh0bWwnXG5cdFx0fSlcblx0fVxufSlcblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgIC8vIFJlZ2lzdGVyIG91ciAqYWJvdXQqIHN0YXRlLlxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdsYW5kaW5nJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9sYW5kaW5nL2xhbmRpbmcuaHRtbCdcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdsb2dpbicsIHtcbiAgICAgICAgdXJsOiAnL2xvZ2luJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9sb2dpbi9sb2dpbi5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0xvZ2luQ3RybCdcbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdMb2dpbkN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cbiAgICAkc2NvcGUubG9naW4gPSB7fTtcbiAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuXG4gICAgJHNjb3BlLnNlbmRMb2dpbiA9IGZ1bmN0aW9uIChsb2dpbkluZm8pIHtcblxuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuXG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ2luKGxvZ2luSW5mbykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJztcbiAgICAgICAgfSk7XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbWVtYmVyc09ubHknLCB7XG4gICAgICAgIHVybDogJy9tZW1iZXJzLWFyZWEnLFxuICAgICAgICB0ZW1wbGF0ZTogJzxpbWcgbmctcmVwZWF0PVwiaXRlbSBpbiBzdGFzaFwiIHdpZHRoPVwiMzAwXCIgbmctc3JjPVwie3sgaXRlbSB9fVwiIC8+JyxcbiAgICAgICAgY29udHJvbGxlcjogZnVuY3Rpb24gKCRzY29wZSwgU2VjcmV0U3Rhc2gpIHtcbiAgICAgICAgICAgIFNlY3JldFN0YXNoLmdldFN0YXNoKCkudGhlbihmdW5jdGlvbiAoc3Rhc2gpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuc3Rhc2ggPSBzdGFzaDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGRhdGEuYXV0aGVudGljYXRlIGlzIHJlYWQgYnkgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgLy8gdGhhdCBjb250cm9scyBhY2Nlc3MgdG8gdGhpcyBzdGF0ZS4gUmVmZXIgdG8gYXBwLmpzLlxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuICAgIH0pO1xuXG59KTtcblxuYXBwLmZhY3RvcnkoJ1NlY3JldFN0YXNoJywgZnVuY3Rpb24gKCRodHRwKSB7XG5cbiAgICB2YXIgZ2V0U3Rhc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9hcGkvbWVtYmVycy9zZWNyZXQtc3Rhc2gnKS50aGVuKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmRhdGE7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXRTdGFzaDogZ2V0U3Rhc2hcbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb250cm9sbGVyKCdEZW1hbmRDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdCRzY29wZS5jbGFzc2VzID0gY2xhc3NlcztcbiAgJHNjb3BlLnNvcnRCeVR5cGUgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIGlmKCF0eXBlKSAkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXM7XG4gICAgZWxzZSB7XG4gICAgICAkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXMuZmlsdGVyKGZ1bmN0aW9uICh2aWRlbykge1xuICAgICAgICByZXR1cm4gdmlkZW8uVHlwZSA9PT0gdHlwZVxuICAgICAgfSlcbiAgICAgIFxuICAgIH1cbiAgfVxufSlcblxudmFyIGNsYXNzZXMgPSBbXG4gIHtcbiAgICBcIklEXCI6IDEsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiQWVyb2JpYyBDaGFpciBWaWRlb1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL203ekNEaWlUQlRrL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1tN3pDRGlpVEJUa1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDIsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiUHJpb3JpdHkgT25lXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvT0E1NWVNeUI4UzAvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PU9BNTVlTXlCOFMwXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMyxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJMb3cgSW1wYWN0IENoYWlyIEFlcm9iaWNzXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvMkF1THFZaDRpckkvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PTJBdUxxWWg0aXJJXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNCxcbiAgICBcIlR5cGVcIjogXCJDaGFpclwiLFxuICAgIFwiVGl0bGVcIjogXCJBZHZhbmNlZCBDaGFpciBFeGVyY2lzZVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL09DOVZid3lFRzhVL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1PQzlWYnd5RUc4VVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDUsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJHZW50bGUgWW9nYVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL0c4QnNMbFBFMW00L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1HOEJzTGxQRTFtNFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDYsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJHZW50bGUgY2hhaXIgeW9nYSByb3V0aW5lXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvS0VqaVh0YjJoUmcvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUtFamlYdGIyaFJnXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogNyxcbiAgICBcIlR5cGVcIjogXCJZb2dhXCIsXG4gICAgXCJUaXRsZVwiOiBcIldoZWVsY2hhaXIgWW9nYVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL0ZyVkUxYTJ2Z3ZBL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1GclZFMWEydmd2QVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDgsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJFbmVyZ2l6aW5nIENoYWlyIFlvZ2FcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9rNFNUMWo5UGZyQS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9azRTVDFqOVBmckFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA5LFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiQmFsYW5jZSBFeGVyY2lzZVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL3otdFVIdU5QU3R3L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj16LXRVSHVOUFN0d1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEwLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiRmFsbCBQcmV2ZW50aW9uIEV4ZXJjaXNlc1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL05KREFvQm9sZHI0L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1OSkRBb0JvbGRyNFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDExLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiNyBCYWxhbmNlIEV4ZXJjaXNlc1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL3ZHYTVDMVFzOGpBL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj12R2E1QzFRczhqQVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEyLFxuICAgIFwiVHlwZVwiOiBcIkZhbGxcIixcbiAgICBcIlRpdGxlXCI6IFwiUG9zdHVyYWwgU3RhYmlsaXR5XCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvejZKb2FKZ29mVDgvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PXo2Sm9hSmdvZlQ4XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTMsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJFYXN5IFFpZ29uZ1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL0FwUzFDTFdPMEJRL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1BcFMxQ0xXTzBCUVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE0LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiVGFpIENoaSBmb3IgQmVnaW5uZXJzXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvVlNkLWNtT0VubXcvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVZTZC1jbU9Fbm13XCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTUsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJUYWkgQ2hpIGZvciBTZW5pb3JzXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvV1ZLTEo4QnVXOFEvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PVdWS0xKOEJ1VzhRXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogMTYsXG4gICAgXCJUeXBlXCI6IFwiVGFpIENoaVwiLFxuICAgIFwiVGl0bGVcIjogXCJMb3cgSW1wYWN0IFRhaSBDaGlcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9oYTFFRjRZeXZVdy9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9aGExRUY0WXl2VXdcIlxuICB9XG5dO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLk9uLURlbWFuZCcsIHtcbiAgICAgICAgdXJsOiAnL29uLWRlbWFuZCcsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9EZW1hbmQvb24tZGVtYW5kLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRGVtYW5kQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmNvbnRyb2xsZXIoJ0ZyaWVuZHNDb250cm9sbGVyJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlKSB7XG5cdCRzY29wZS5mcmllbmRzID0gZnJpZW5kcy5zb3J0KGNvbXBhcmUpO1xuXHQkc2NvcGUuZmluZE5lYXJieSA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc3RhdGUuZ28oJ2RlbW8ubmVhcmJ5Jylcblx0fVxuXHQkc2NvcGUubGVhZGVyYm9hcmQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHN0YXRlLmdvKCdkZW1vLkZyaWVuZCcpXG5cdH1cbn0pXG5cbmZ1bmN0aW9uIGNvbXBhcmUoYSxiKSB7XG4gIGlmIChhLnNjb3JlIDwgYi5zY29yZSlcbiAgICByZXR1cm4gMTtcbiAgaWYgKGEuc2NvcmUgPiBiLnNjb3JlKVxuICAgIHJldHVybiAtMTtcbiAgcmV0dXJuIDA7XG59XG5cbnZhciBmcmllbmRzID0gW1xuXHR7XG5cdFx0bmFtZTogJ0pvaG4gSGFuY29jaycsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAwLzEwMCcsXG5cdFx0c2NvcmU6IDIwXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2ViYXN0aWFuIExvZmdyZW4nLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEyMC8xMjAnLFxuXHRcdHNjb3JlOiAyMFxuXHRcdFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ0RvbmFsZCBUcnVtcCcsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTEwLzExMCcsXG5cdFx0c2NvcmU6IDMyXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnQmlsbCBIYWRlcicsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTA1LzEwNScsXG5cdFx0c2NvcmU6IDIxXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2FsdmFkb3IgRGFsaScsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAxLzEwMScsXG5cdFx0c2NvcmU6IDIzXG5cdH1cbl1cblxudmFyIHN0cmFuZ2VycyA9IFtdO1xuXG5mdW5jdGlvbiBmaW5kTmFtZSAoKSB7XG5cdHJldHVybiAnQmFyYmFyYSc7XG59XG5cbmZ1bmN0aW9uIGZpbmREaXN0YW5jZSAoKSB7XG5cdHJldHVybiBNYXRoLnJhbmRvbSgpICogMTAgKyAnIE1pbGVzIEF3YXknXG59XG5cbmZ1bmN0aW9uIGZpbmRBZ2UgKCkge1xuXHRyZXR1cm4gTWF0aC5yYW5kb20oKSAqIDEwMCArICcgWWVhcnMgWW91bmcnXG59XG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5GcmllbmQnLCB7XG4gICAgICAgIHVybDogJy9mcmllbmRzJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL0ZyaWVuZHMvZnJpZW5kcy5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0ZyaWVuZHNDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTsiLCJhcHAuY29udHJvbGxlcignTGl2ZUNvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkY29tcGlsZSwgdWlDYWxlbmRhckNvbmZpZykge1xuXHRcblx0dmFyIGRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgIHZhciBkID0gZGF0ZS5nZXREYXRlKCk7XG4gICAgdmFyIG0gPSBkYXRlLmdldE1vbnRoKCk7XG4gICAgdmFyIHkgPSBkYXRlLmdldEZ1bGxZZWFyKCk7XG4gICAgXG4gICAgJHNjb3BlLmNoYW5nZVRvID0gJ0h1bmdhcmlhbic7XG4gICAgLyogZXZlbnQgc291cmNlIHRoYXQgcHVsbHMgZnJvbSBnb29nbGUuY29tICovXG4gICAgJHNjb3BlLmV2ZW50U291cmNlID0ge1xuICAgICAgICAgICAgdXJsOiBcImh0dHA6Ly93d3cuZ29vZ2xlLmNvbS9jYWxlbmRhci9mZWVkcy91c2FfX2VuJTQwaG9saWRheS5jYWxlbmRhci5nb29nbGUuY29tL3B1YmxpYy9iYXNpY1wiLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiAnZ2NhbC1ldmVudCcsICAgICAgICAgICAvLyBhbiBvcHRpb24hXG4gICAgICAgICAgICBjdXJyZW50VGltZXpvbmU6ICdBbWVyaWNhL0NoaWNhZ28nIC8vIGFuIG9wdGlvbiFcbiAgICB9O1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IGNvbnRhaW5zIGN1c3RvbSBldmVudHMgb24gdGhlIHNjb3BlICovXG4gICAgJHNjb3BlLmV2ZW50cyA9IFtcblx0XHRcdCAgICAgIHt0aXRsZTogJ1RhaSBDaGknLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkKSwgdXJsOidodHRwOi8vZ29vZ2xlLmNvbSd9LFxuXHRcdFx0ICAgICAge3RpdGxlOiAnQWVyb2JpY3Mgd2l0aCBSaWNoYXJkJyxzdGFydDogbmV3IERhdGUoeSwgbSwgZCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkIC0gMil9LFxuXHRcdFx0ICAgICAge2lkOiA5OTksdGl0bGU6ICdDaGFpciBFeGVyY2lzZXMgd2l0aCBDbGFpcicsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQsIDE2LCAwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICAgIHtpZDogOTk5LHRpdGxlOiAnQmFsYW5jZSB3aXRoIEpvaG4nLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdZb2dhIHdpdGggUGV0ZXInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxOSwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkICsgMSwgMjIsIDMwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICBdO1xuICAgIC8qIGV2ZW50IHNvdXJjZSB0aGF0IGNhbGxzIGEgZnVuY3Rpb24gb24gZXZlcnkgdmlldyBzd2l0Y2ggKi9cbiAgICAkc2NvcGUuZXZlbnRzRiA9IGZ1bmN0aW9uIChzdGFydCwgZW5kLCB0aW1lem9uZSwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBzID0gbmV3IERhdGUoc3RhcnQpLmdldFRpbWUoKSAvIDEwMDA7XG4gICAgICB2YXIgZSA9IG5ldyBEYXRlKGVuZCkuZ2V0VGltZSgpIC8gMTAwMDtcbiAgICAgIHZhciBtID0gbmV3IERhdGUoc3RhcnQpLmdldE1vbnRoKCk7XG4gICAgICB2YXIgZXZlbnRzID0gW3t0aXRsZTogJ0ZlZWQgTWUgJyArIG0sc3RhcnQ6IHMgKyAoNTAwMDApLGVuZDogcyArICgxMDAwMDApLGFsbERheTogZmFsc2UsIGNsYXNzTmFtZTogWydjdXN0b21GZWVkJ119XTtcbiAgICAgIGNhbGxiYWNrKGV2ZW50cyk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYWxFdmVudHNFeHQgPSB7XG4gICAgICAgY29sb3I6ICcjZjAwJyxcbiAgICAgICB0ZXh0Q29sb3I6ICd5ZWxsb3cnLFxuICAgICAgIGV2ZW50czogWyBcbiAgICAgICAgICB7dHlwZToncGFydHknLHRpdGxlOiAnTHVuY2gnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0x1bmNoIDInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMiwgMCksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkLCAxNCwgMCksYWxsRGF5OiBmYWxzZX0sXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0NsaWNrIGZvciBHb29nbGUnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksdXJsOiAnaHR0cDovL2dvb2dsZS5jb20vJ31cbiAgICAgICAgXVxuICAgIH07XG5cbiAgICAkc2NvcGUuZXZlbnRDbGljayA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgaWYoZXZlbnQudXJsKSB7XG4gICAgICAgIHdpbmRvdy5vcGVuKGV2ZW50LnVybCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLyogYWxlcnQgb24gZXZlbnRDbGljayAqL1xuICAgICRzY29wZS5hbGVydE9uRXZlbnRDbGljayA9IGZ1bmN0aW9uKCBkYXRlLCBqc0V2ZW50LCB2aWV3KXtcbiAgICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9IChkYXRlLnRpdGxlICsgJyB3YXMgY2xpY2tlZCAnKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIERyb3AgKi9cbiAgICAgJHNjb3BlLmFsZXJ0T25Ecm9wID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyl7XG4gICAgICAgJHNjb3BlLmFsZXJ0TWVzc2FnZSA9ICgnRXZlbnQgRHJvcGVkIHRvIG1ha2UgZGF5RGVsdGEgJyArIGRlbHRhKTtcbiAgICB9O1xuICAgIC8qIGFsZXJ0IG9uIFJlc2l6ZSAqL1xuICAgICRzY29wZS5hbGVydE9uUmVzaXplID0gZnVuY3Rpb24oZXZlbnQsIGRlbHRhLCByZXZlcnRGdW5jLCBqc0V2ZW50LCB1aSwgdmlldyApe1xuICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoJ0V2ZW50IFJlc2l6ZWQgdG8gbWFrZSBkYXlEZWx0YSAnICsgZGVsdGEpO1xuICAgIH07XG4gICAgLyogYWRkIGFuZCByZW1vdmVzIGFuIGV2ZW50IHNvdXJjZSBvZiBjaG9pY2UgKi9cbiAgICAkc2NvcGUuYWRkUmVtb3ZlRXZlbnRTb3VyY2UgPSBmdW5jdGlvbihzb3VyY2VzLHNvdXJjZSkge1xuICAgICAgdmFyIGNhbkFkZCA9IDA7XG4gICAgICBhbmd1bGFyLmZvckVhY2goc291cmNlcyxmdW5jdGlvbih2YWx1ZSwga2V5KXtcbiAgICAgICAgaWYoc291cmNlc1trZXldID09PSBzb3VyY2Upe1xuICAgICAgICAgIHNvdXJjZXMuc3BsaWNlKGtleSwxKTtcbiAgICAgICAgICBjYW5BZGQgPSAxO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmKGNhbkFkZCA9PT0gMCl7XG4gICAgICAgIHNvdXJjZXMucHVzaChzb3VyY2UpO1xuICAgICAgfVxuICAgIH07XG4gICAgLyogYWRkIGN1c3RvbSBldmVudCovXG4gICAgJHNjb3BlLmFkZEV2ZW50ID0gZnVuY3Rpb24oKSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnB1c2goe1xuICAgICAgICB0aXRsZTogJ09wZW4gU2VzYW1lJyxcbiAgICAgICAgc3RhcnQ6IG5ldyBEYXRlKHksIG0sIDI4KSxcbiAgICAgICAgZW5kOiBuZXcgRGF0ZSh5LCBtLCAyOSksXG4gICAgICAgIGNsYXNzTmFtZTogWydvcGVuU2VzYW1lJ11cbiAgICAgIH0pO1xuICAgIH07XG4gICAgLyogcmVtb3ZlIGV2ZW50ICovXG4gICAgJHNjb3BlLnJlbW92ZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAkc2NvcGUuZXZlbnRzLnNwbGljZShpbmRleCwxKTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLmNoYW5nZVZpZXcgPSBmdW5jdGlvbih2aWV3LGNhbGVuZGFyKSB7XG4gICAgICB1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0uZnVsbENhbGVuZGFyKCdjaGFuZ2VWaWV3Jyx2aWV3KTtcbiAgICB9O1xuICAgIC8qIENoYW5nZSBWaWV3ICovXG4gICAgJHNjb3BlLnJlbmRlckNhbGVuZGVyID0gZnVuY3Rpb24oY2FsZW5kYXIpIHtcbiAgICAgIGlmKHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXSl7XG4gICAgICAgIHVpQ2FsZW5kYXJDb25maWcuY2FsZW5kYXJzW2NhbGVuZGFyXS5mdWxsQ2FsZW5kYXIoJ3JlbmRlcicpO1xuICAgICAgfVxuICAgIH07XG4gICAgIC8qIFJlbmRlciBUb29sdGlwICovXG4gICAgJHNjb3BlLmV2ZW50UmVuZGVyID0gZnVuY3Rpb24oIGV2ZW50LCBlbGVtZW50LCB2aWV3ICkgeyBcbiAgICAgICAgZWxlbWVudC5hdHRyKHsndG9vbHRpcCc6IGV2ZW50LnRpdGxlLFxuICAgICAgICAgICAgICAgICAgICAgJ3Rvb2x0aXAtYXBwZW5kLXRvLWJvZHknOiB0cnVlfSk7XG4gICAgICAgICRjb21waWxlKGVsZW1lbnQpKCRzY29wZSk7XG4gICAgfTtcbiAgICAvKiBjb25maWcgb2JqZWN0ICovXG4gICAgJHNjb3BlLnVpQ29uZmlnID0ge1xuICAgICAgY2FsZW5kYXI6e1xuICAgICAgICBkZWZhdWx0VmlldzogJ2FnZW5kYURheScsXG4gICAgICAgIGhlaWdodDogNDUwLFxuICAgICAgICBlZGl0YWJsZTogdHJ1ZSxcbiAgICAgICAgaGVhZGVyOntcbiAgICAgICAgICBsZWZ0OiAndGl0bGUnLFxuICAgICAgICAgIGNlbnRlcjogJ2FnZW5kYURheSwgbW9udGgsIGFnZW5kYVdlZWsnLFxuICAgICAgICAgIHJpZ2h0OiAndG9kYXkgcHJldixuZXh0J1xuICAgICAgICB9LFxuICAgICAgICBldmVudENsaWNrOiAkc2NvcGUuYWxlcnRPbkV2ZW50Q2xpY2ssXG4gICAgICAgIGV2ZW50RHJvcDogJHNjb3BlLmFsZXJ0T25Ecm9wLFxuICAgICAgICBldmVudFJlc2l6ZTogJHNjb3BlLmFsZXJ0T25SZXNpemUsXG4gICAgICAgIGV2ZW50UmVuZGVyOiAkc2NvcGUuZXZlbnRSZW5kZXJcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgJHNjb3BlLmNoYW5nZUxhbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmKCRzY29wZS5jaGFuZ2VUbyA9PT0gJ0h1bmdhcmlhbicpe1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXMgPSBbXCJWYXPDoXJuYXBcIiwgXCJIw6l0ZsWRXCIsIFwiS2VkZFwiLCBcIlN6ZXJkYVwiLCBcIkNzw7x0w7ZydMO2a1wiLCBcIlDDqW50ZWtcIiwgXCJTem9tYmF0XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlZhc1wiLCBcIkjDqXRcIiwgXCJLZWRkXCIsIFwiU3plXCIsIFwiQ3PDvHRcIiwgXCJQw6luXCIsIFwiU3pvXCJdO1xuICAgICAgICAkc2NvcGUuY2hhbmdlVG89ICdFbmdsaXNoJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICRzY29wZS51aUNvbmZpZy5jYWxlbmRhci5kYXlOYW1lcyA9IFtcIlN1bmRheVwiLCBcIk1vbmRheVwiLCBcIlR1ZXNkYXlcIiwgXCJXZWRuZXNkYXlcIiwgXCJUaHVyc2RheVwiLCBcIkZyaWRheVwiLCBcIlNhdHVyZGF5XCJdO1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXNTaG9ydCA9IFtcIlN1blwiLCBcIk1vblwiLCBcIlR1ZVwiLCBcIldlZFwiLCBcIlRodVwiLCBcIkZyaVwiLCBcIlNhdFwiXTtcbiAgICAgICAgJHNjb3BlLmNoYW5nZVRvID0gJ0h1bmdhcmlhbic7XG4gICAgICB9XG4gICAgfTtcbiAgICAvKiBldmVudCBzb3VyY2VzIGFycmF5Ki9cbiAgICAkc2NvcGUuZXZlbnRTb3VyY2VzID0gWyRzY29wZS5ldmVudHMsICRzY29wZS5ldmVudFNvdXJjZSwgJHNjb3BlLmV2ZW50c0ZdO1xuICAgICRzY29wZS5ldmVudFNvdXJjZXMyID0gWyRzY29wZS5jYWxFdmVudHNFeHQsICRzY29wZS5ldmVudHNGLCAkc2NvcGUuZXZlbnRzXTtcblxuXHQkc2NvcGUuY2hhbmdlQ2xhc3NDYXRlZ29yeSgnTGl2ZScpO1xufSkiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uTGl2ZScsIHtcbiAgICAgICAgdXJsOiAnL2xpdmUnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0xpdmVDb250cm9sbGVyJ1xuICAgIH0pO1xuXG59KTtcbiIsImFwcC5jb250cm9sbGVyKCdUcmFpbmVyQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSkge1xuXHQkc2NvcGUudHJhaW5lcnMgPSB0cmFpbmVycy5zb3J0KCk7XG59KVxuXG52YXIgdHJhaW5lcnMgPSBbXG5cdHtcblx0XHRuYW1lOiAnSm9obiBIYW5jb2NrJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDAvMTAwJyxcblx0XHRzcGVjaWFsaXR5OiAnQ2hhaXInXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2ViYXN0aWFuIExvZmdyZW4nLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEyMC8xMjAnLFxuXHRcdHNwZWNpYWxpdHk6ICdDaGFpcidcblx0XHRcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdEb25hbGQgVHJ1bXAnLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzExMC8xMTAnLFxuXHRcdHNwZWNpYWxpdHk6ICdBZXJvYmljcydcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdCaWxsIEhhZGVyJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDUvMTA1Jyxcblx0XHRzcGVjaWFsaXR5OiAnUGVyc29uYWwgVHJhaW5lcidcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdTYWx2YWRvciBEYWxpJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMDEvMTAxJyxcblx0XHRzcGVjaWFsaXR5OiBcIlBoeXNpY2FsIFRoZXJhcGlzdFwiXG5cdH1cbl1cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5UcmFpbmVyJywge1xuICAgICAgICB1cmw6ICcvdHJhaW5lcnMnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vVHJhaW5lcnMvdHJhaW5lcnMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdUcmFpbmVyQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmZhY3RvcnkoJ0Z1bGxzdGFja1BpY3MnLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgJ2h0dHBzOi8vcGJzLnR3aW1nLmNvbS9tZWRpYS9CN2dCWHVsQ0FBQVhRY0UuanBnOmxhcmdlJyxcbiAgICAgICAgJ2h0dHBzOi8vZmJjZG4tc3Bob3Rvcy1jLWEuYWthbWFpaGQubmV0L2hwaG90b3MtYWsteGFwMS90MzEuMC04LzEwODYyNDUxXzEwMjA1NjIyOTkwMzU5MjQxXzgwMjcxNjg4NDMzMTI4NDExMzdfby5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItTEtVc2hJZ0FFeTlTSy5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I3OS1YN29DTUFBa3c3eS5qcGcnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItVWo5Q09JSUFJRkFoMC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I2eUl5RmlDRUFBcWwxMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFLVQ3NWxXQUFBbXFxSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFdlpBZy1WQUFBazkzMi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFZ05NZU9YSUFJZkRoSy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NFUXlJRE5XZ0FBdTYwQi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NDRjNUNVFXOEFFMmxHSi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBZVZ3NVNXb0FBQUxzai5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBYUpJUDdVa0FBbElHcy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NBUU93OWxXRUFBWTlGbC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0ItT1FiVnJDTUFBTndJTS5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I5Yl9lcndDWUFBd1JjSi5wbmc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I1UFRkdm5DY0FFQWw0eC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I0cXdDMGlDWUFBbFBHaC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0IyYjMzdlJJVUFBOW8xRC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0J3cEl3cjFJVUFBdk8yXy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0JzU3NlQU5DWUFFT2hMdy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NKNHZMZnVVd0FBZGE0TC5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJN3d6akVWRUFBT1BwUy5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJZEh2VDJVc0FBbm5IVi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NHQ2lQX1lXWUFBbzc1Vi5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0NJUzRKUElXSUFJMzdxdS5qcGc6bGFyZ2UnXG4gICAgXTtcbn0pO1xuIiwiYXBwLmZhY3RvcnkoJ1JhbmRvbUdyZWV0aW5ncycsIGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBnZXRSYW5kb21Gcm9tQXJyYXkgPSBmdW5jdGlvbiAoYXJyKSB7XG4gICAgICAgIHJldHVybiBhcnJbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXJyLmxlbmd0aCldO1xuICAgIH07XG5cbiAgICB2YXIgZ3JlZXRpbmdzID0gW1xuICAgICAgICAnSGVsbG8sIHdvcmxkIScsXG4gICAgICAgICdBdCBsb25nIGxhc3QsIEkgbGl2ZSEnLFxuICAgICAgICAnSGVsbG8sIHNpbXBsZSBodW1hbi4nLFxuICAgICAgICAnV2hhdCBhIGJlYXV0aWZ1bCBkYXkhJyxcbiAgICAgICAgJ0lcXCdtIGxpa2UgYW55IG90aGVyIHByb2plY3QsIGV4Y2VwdCB0aGF0IEkgYW0geW91cnMuIDopJyxcbiAgICAgICAgJ1RoaXMgZW1wdHkgc3RyaW5nIGlzIGZvciBMaW5kc2F5IExldmluZS4nLFxuICAgICAgICAn44GT44KT44Gr44Gh44Gv44CB44Om44O844K244O85qeY44CCJyxcbiAgICAgICAgJ1dlbGNvbWUuIFRvLiBXRUJTSVRFLicsXG4gICAgICAgICc6RCcsXG4gICAgICAgICdZZXMsIEkgdGhpbmsgd2VcXCd2ZSBtZXQgYmVmb3JlLicsXG4gICAgICAgICdHaW1tZSAzIG1pbnMuLi4gSSBqdXN0IGdyYWJiZWQgdGhpcyByZWFsbHkgZG9wZSBmcml0dGF0YScsXG4gICAgICAgICdJZiBDb29wZXIgY291bGQgb2ZmZXIgb25seSBvbmUgcGllY2Ugb2YgYWR2aWNlLCBpdCB3b3VsZCBiZSB0byBuZXZTUVVJUlJFTCEnLFxuICAgIF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBncmVldGluZ3M6IGdyZWV0aW5ncyxcbiAgICAgICAgZ2V0UmFuZG9tR3JlZXRpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRSYW5kb21Gcm9tQXJyYXkoZ3JlZXRpbmdzKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLm5lYXJieScsIHtcbiAgICAgICAgdXJsOiAnL25lYXJieScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9GcmllbmRzL25lYXJieS9uZWFyYnkuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdGcmllbmRzQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgncmFuZG9HcmVldGluZycsIGZ1bmN0aW9uIChSYW5kb21HcmVldGluZ3MpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvcmFuZG8tZ3JlZXRpbmcvcmFuZG8tZ3JlZXRpbmcuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgICAgc2NvcGUuZ3JlZXRpbmcgPSBSYW5kb21HcmVldGluZ3MuZ2V0UmFuZG9tR3JlZXRpbmcoKTtcbiAgICAgICAgfVxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnbmF2YmFyJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge30sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdIb21lJywgc3RhdGU6ICdob21lJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdBYm91dCcsIHN0YXRlOiAnYWJvdXQnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ0RvY3VtZW50YXRpb24nLCBzdGF0ZTogJ2RvY3MnIH0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ01lbWJlcnMgT25seScsIHN0YXRlOiAnbWVtYmVyc09ubHknLCBhdXRoOiB0cnVlIH1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuXG4gICAgICAgICAgICBzY29wZS5pc0xvZ2dlZEluID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5sb2dvdXQoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgcmVtb3ZlVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNldFVzZXIoKTtcblxuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzLCBzZXRVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MsIHJlbW92ZVVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIHJlbW92ZVVzZXIpO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIl19
