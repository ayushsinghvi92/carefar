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
app.controller('FriendsController', function ($scope, $state, $http) {
    $scope.friends = friends.sort(compare);
    $scope.findNearby = function () {
        $state.go('demo.nearby');
    };
    $scope.leaderboard = function () {
        $state.go('demo.Friend');
    };
    $http.get('https://randomuser.me/api/?results=50&gender=female').then(function (result) {
        return result.data.results;
    }).then(function (data) {
        $scope.nearby = data;
        console.log($scope.nearby[1]);
    });

    $scope.findAge = findAge;
    $scope.findDistance = findDistance;
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
    return Math.round(Math.random() * 10) + ' Miles Away';
}

function findAge(person) {
    var birthday = new Date(person.dob);
    var age = 2016 - birthday.getFullYear();
    return age + ' Years Young';
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

app.config(function ($stateProvider) {

    $stateProvider.state('demo.nearby', {
        url: '/nearby',
        templateUrl: 'js/demo/Friends/nearby/nearby.html',
        controller: 'FriendsController'
    });
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImFib3V0L2Fib3V0LmpzIiwiZGVtby9EZW1vQ29udHJvbGxlci5qcyIsImRlbW8vZGVtby5zdGF0ZS5qcyIsImRvY3MvZG9jcy5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiZ3JpZC9ncmlkLmpzIiwibGFuZGluZy9sYW5kaW5nLnN0YXRlLmpzIiwibG9naW4vbG9naW4uanMiLCJtZW1iZXJzLW9ubHkvbWVtYmVycy1vbmx5LmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9GdWxsc3RhY2tQaWNzLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9SYW5kb21HcmVldGluZ3MuanMiLCJkZW1vL0RlbWFuZC9kZW1hbmQuY3RybC5qcyIsImRlbW8vRGVtYW5kL2RlbWFuZC5zdGF0ZS5qcyIsImRlbW8vRnJpZW5kcy9mcmllbmRzLmN0cmwuanMiLCJkZW1vL0ZyaWVuZHMvZnJpZW5kcy5zdGF0ZS5qcyIsImRlbW8vTGl2ZS9saXZlQ2xhc3Nlcy5jdHJsLmpzIiwiZGVtby9MaXZlL2xpdmVDbGFzc2VzLnN0YXRlLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5jdHJsLmpzIiwiZGVtby9UcmFpbmVycy90cmFpbmVycy5zdGF0ZS5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL3JhbmRvLWdyZWV0aW5nL3JhbmRvLWdyZWV0aW5nLmpzIiwiZGVtby9GcmllbmRzL25lYXJieS9uZWFyYnkuc3RhdGUuanMiXSwibmFtZXMiOlsid2luZG93IiwiYXBwIiwiYW5ndWxhciIsIm1vZHVsZSIsImNvbmZpZyIsIiR1cmxSb3V0ZXJQcm92aWRlciIsIiRsb2NhdGlvblByb3ZpZGVyIiwiaHRtbDVNb2RlIiwib3RoZXJ3aXNlIiwid2hlbiIsImxvY2F0aW9uIiwicmVsb2FkIiwicnVuIiwiJHJvb3RTY29wZSIsIiR3aW5kb3ciLCIkbG9jYXRpb24iLCJnYSIsIiRvbiIsImV2ZW50IiwidG9TdGF0ZSIsInRvUGFyYW1zIiwiZnJvbVN0YXRlIiwiZnJvbVBhcmFtcyIsInRocm93bkVycm9yIiwiY29uc29sZSIsImluZm8iLCJlcnJvciIsInBhdGgiLCJBdXRoU2VydmljZSIsIiRzdGF0ZSIsImRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgiLCJzdGF0ZSIsImRhdGEiLCJhdXRoZW50aWNhdGUiLCJpc0F1dGhlbnRpY2F0ZWQiLCJwcmV2ZW50RGVmYXVsdCIsImdldExvZ2dlZEluVXNlciIsInRoZW4iLCJ1c2VyIiwiZ28iLCJuYW1lIiwiJHN0YXRlUHJvdmlkZXIiLCJ1cmwiLCJjb250cm9sbGVyIiwidGVtcGxhdGVVcmwiLCIkc2NvcGUiLCJGdWxsc3RhY2tQaWNzIiwiaW1hZ2VzIiwiXyIsInNodWZmbGUiLCJjaGFuZ2VDbGFzc0NhdGVnb3J5IiwiY2F0ZWdvcnkiLCJjbGFzc0NhdGVnb3J5IiwiRXJyb3IiLCJmYWN0b3J5IiwiaW8iLCJvcmlnaW4iLCJjb25zdGFudCIsImxvZ2luU3VjY2VzcyIsImxvZ2luRmFpbGVkIiwibG9nb3V0U3VjY2VzcyIsInNlc3Npb25UaW1lb3V0Iiwibm90QXV0aGVudGljYXRlZCIsIm5vdEF1dGhvcml6ZWQiLCIkcSIsIkFVVEhfRVZFTlRTIiwic3RhdHVzRGljdCIsInJlc3BvbnNlRXJyb3IiLCJyZXNwb25zZSIsIiRicm9hZGNhc3QiLCJzdGF0dXMiLCJyZWplY3QiLCIkaHR0cFByb3ZpZGVyIiwiaW50ZXJjZXB0b3JzIiwicHVzaCIsIiRpbmplY3RvciIsImdldCIsInNlcnZpY2UiLCIkaHR0cCIsIlNlc3Npb24iLCJvblN1Y2Nlc3NmdWxMb2dpbiIsImNyZWF0ZSIsImZyb21TZXJ2ZXIiLCJjYXRjaCIsImxvZ2luIiwiY3JlZGVudGlhbHMiLCJwb3N0IiwibWVzc2FnZSIsImxvZ291dCIsImRlc3Ryb3kiLCJzZWxmIiwiJHVpYk1vZGFsIiwib3Blbk1vZGFsIiwib3BlbiIsInNlbmRMb2dpbiIsImxvZ2luSW5mbyIsInRlbXBsYXRlIiwiU2VjcmV0U3Rhc2giLCJnZXRTdGFzaCIsInN0YXNoIiwiZ2V0UmFuZG9tRnJvbUFycmF5IiwiYXJyIiwiTWF0aCIsImZsb29yIiwicmFuZG9tIiwibGVuZ3RoIiwiZ3JlZXRpbmdzIiwiZ2V0UmFuZG9tR3JlZXRpbmciLCJjbGFzc2VzIiwic29ydEJ5VHlwZSIsInR5cGUiLCJmaWx0ZXIiLCJ2aWRlbyIsIlR5cGUiLCJmcmllbmRzIiwic29ydCIsImNvbXBhcmUiLCJmaW5kTmVhcmJ5IiwibGVhZGVyYm9hcmQiLCJyZXN1bHQiLCJyZXN1bHRzIiwibmVhcmJ5IiwibG9nIiwiZmluZEFnZSIsImZpbmREaXN0YW5jZSIsImEiLCJiIiwic2NvcmUiLCJpbWFnZSIsInN0cmFuZ2VycyIsImZpbmROYW1lIiwicm91bmQiLCJwZXJzb24iLCJiaXJ0aGRheSIsIkRhdGUiLCJkb2IiLCJhZ2UiLCJnZXRGdWxsWWVhciIsIiRjb21waWxlIiwidWlDYWxlbmRhckNvbmZpZyIsImRhdGUiLCJkIiwiZ2V0RGF0ZSIsIm0iLCJnZXRNb250aCIsInkiLCJjaGFuZ2VUbyIsImV2ZW50U291cmNlIiwiY2xhc3NOYW1lIiwiY3VycmVudFRpbWV6b25lIiwiZXZlbnRzIiwidGl0bGUiLCJzdGFydCIsImVuZCIsImlkIiwiYWxsRGF5IiwiZXZlbnRzRiIsInRpbWV6b25lIiwiY2FsbGJhY2siLCJzIiwiZ2V0VGltZSIsImUiLCJjYWxFdmVudHNFeHQiLCJjb2xvciIsInRleHRDb2xvciIsImV2ZW50Q2xpY2siLCJhbGVydE9uRXZlbnRDbGljayIsImpzRXZlbnQiLCJ2aWV3IiwiYWxlcnRNZXNzYWdlIiwiYWxlcnRPbkRyb3AiLCJkZWx0YSIsInJldmVydEZ1bmMiLCJ1aSIsImFsZXJ0T25SZXNpemUiLCJhZGRSZW1vdmVFdmVudFNvdXJjZSIsInNvdXJjZXMiLCJzb3VyY2UiLCJjYW5BZGQiLCJmb3JFYWNoIiwidmFsdWUiLCJrZXkiLCJzcGxpY2UiLCJhZGRFdmVudCIsInJlbW92ZSIsImluZGV4IiwiY2hhbmdlVmlldyIsImNhbGVuZGFyIiwiY2FsZW5kYXJzIiwiZnVsbENhbGVuZGFyIiwicmVuZGVyQ2FsZW5kZXIiLCJldmVudFJlbmRlciIsImVsZW1lbnQiLCJhdHRyIiwidWlDb25maWciLCJkZWZhdWx0VmlldyIsImhlaWdodCIsImVkaXRhYmxlIiwiaGVhZGVyIiwibGVmdCIsImNlbnRlciIsInJpZ2h0IiwiZXZlbnREcm9wIiwiZXZlbnRSZXNpemUiLCJjaGFuZ2VMYW5nIiwiZGF5TmFtZXMiLCJkYXlOYW1lc1Nob3J0IiwiZXZlbnRTb3VyY2VzIiwiZXZlbnRTb3VyY2VzMiIsInRyYWluZXJzIiwic3BlY2lhbGl0eSIsImRpcmVjdGl2ZSIsInJlc3RyaWN0Iiwic2NvcGUiLCJsaW5rIiwiaXRlbXMiLCJsYWJlbCIsImF1dGgiLCJpc0xvZ2dlZEluIiwic2V0VXNlciIsInJlbW92ZVVzZXIiLCJSYW5kb21HcmVldGluZ3MiLCJncmVldGluZyJdLCJtYXBwaW5ncyI6IkFBQUE7O0FBQ0FBLE9BQUFDLEdBQUEsR0FBQUMsUUFBQUMsTUFBQSxDQUFBLFlBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxhQUFBLEVBQUEsV0FBQSxFQUFBLGNBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTs7QUFFQUYsSUFBQUcsTUFBQSxDQUFBLFVBQUFDLGtCQUFBLEVBQUFDLGlCQUFBLEVBQUE7QUFDQTtBQUNBQSxzQkFBQUMsU0FBQSxDQUFBLElBQUE7QUFDQTtBQUNBRix1QkFBQUcsU0FBQSxDQUFBLEdBQUE7QUFDQTtBQUNBSCx1QkFBQUksSUFBQSxDQUFBLGlCQUFBLEVBQUEsWUFBQTtBQUNBVCxlQUFBVSxRQUFBLENBQUFDLE1BQUE7QUFDQSxLQUZBO0FBR0EsQ0FUQTs7QUFXQTtBQUNBVixJQUFBVyxHQUFBLENBQUEsVUFBQUMsVUFBQSxFQUFBQyxPQUFBLEVBQUFDLFNBQUEsRUFBQTtBQUNBRCxZQUFBRSxFQUFBLENBQUEsUUFBQSxFQUFBLGVBQUEsRUFBQSxNQUFBO0FB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LG9CQUFBO0FBSEEsS0FBQTtBQU1BLENBUkEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnQ2FyZUZhckFwcCcsIFsnZnNhUHJlQnVpbHQnLCd1aS5jYWxlbmRhcicsJ3VpLnJvdXRlcicsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvJyk7XG4gICAgLy8gVHJpZ2dlciBwYWdlIHJlZnJlc2ggd2hlbiBhY2Nlc3NpbmcgYW4gT0F1dGggcm91dGVcbiAgICAkdXJsUm91dGVyUHJvdmlkZXIud2hlbignL2F1dGgvOnByb3ZpZGVyJywgZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfSk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBsaXN0ZW5pbmcgdG8gZXJyb3JzIGJyb2FkY2FzdGVkIGJ5IHVpLXJvdXRlciwgdXN1YWxseSBvcmlnaW5hdGluZyBmcm9tIHJlc29sdmVzXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkd2luZG93LCAkbG9jYXRpb24pIHtcbiAgICAkd2luZG93LmdhKCdjcmVhdGUnLCAnVUEtODU1NTY4NDYtMScsICdhdXRvJyk7XG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZUVycm9yJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcywgZnJvbVN0YXRlLCBmcm9tUGFyYW1zLCB0aHJvd25FcnJvcikge1xuICAgICAgICBjb25zb2xlLmluZm8oJ1RoZSBmb2xsb3dpbmcgZXJyb3Igd2FzIHRocm93biBieSB1aS1yb3V0ZXIgd2hpbGUgdHJhbnNpdGlvbmluZyB0byBzdGF0ZSBcIiR7dG9TdGF0ZS5uYW1lfVwiLiBUaGUgb3JpZ2luIG9mIHRoaXMgZXJyb3IgaXMgcHJvYmFibHkgYSByZXNvbHZlIGZ1bmN0aW9uOicpO1xuICAgICAgICBjb25zb2xlLmVycm9yKHRocm93bkVycm9yKTtcbiAgICB9KTtcbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMsIGZyb21TdGF0ZSkge1xuICAgICAgICAkd2luZG93LmdhKCdzZW5kJywgJ3BhZ2V2aWV3JywgJGxvY2F0aW9uLnBhdGgoKSk7XG4gICAgfSk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSwgJHdpbmRvdywgJGxvY2F0aW9uKSB7XG5cbiAgICAvLyBUaGUgZ2l2ZW4gc3RhdGUgcmVxdWlyZXMgYW4gYXV0aGVudGljYXRlZCB1c2VyLlxuICAgIHZhciBkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kYXRhICYmIHN0YXRlLmRhdGEuYXV0aGVudGljYXRlO1xuICAgIH07XG5cbiAgICAvLyAkc3RhdGVDaGFuZ2VTdGFydCBpcyBhbiBldmVudCBmaXJlZFxuICAgIC8vIHdoZW5ldmVyIHRoZSBwcm9jZXNzIG9mIGNoYW5naW5nIGEgc3RhdGUgYmVnaW5zLlxuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMpIHtcblxuICAgICAgICAgJHdpbmRvdy5nYSgnc2VuZCcsICdwYWdldmlld0NsaWNrJywgJGxvY2F0aW9uLnBhdGgoKSk7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgLy8gUmVnaXN0ZXIgb3VyICphYm91dCogc3RhdGUuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2Fib3V0Jywge1xuICAgICAgICB1cmw6ICcvYWJvdXQnLFxuICAgICAgICBjb250cm9sbGVyOiAnQWJvdXRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9hYm91dC9hYm91dC5odG1sJ1xuICAgIH0pO1xuXG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0Fib3V0Q29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsIEZ1bGxzdGFja1BpY3MpIHtcblxuICAgIC8vIEltYWdlcyBvZiBiZWF1dGlmdWwgRnVsbHN0YWNrIHBlb3BsZS5cbiAgICAkc2NvcGUuaW1hZ2VzID0gXy5zaHVmZmxlKEZ1bGxzdGFja1BpY3MpO1xuXG59KTtcbiIsImFwcC5jb250cm9sbGVyKCdEZW1vQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSkge1xuXHRcblx0JHNjb3BlLmNoYW5nZUNsYXNzQ2F0ZWdvcnkgPSBmdW5jdGlvbiAoY2F0ZWdvcnkpIHtcblx0XHQkc2NvcGUuY2xhc3NDYXRlZ29yeSA9IGNhdGVnb3J5O1xuXHRcdCRzdGF0ZS5nbygnZGVtby4nK2NhdGVnb3J5KVxuXHR9XG5cblx0JHNjb3BlLmNoYW5nZUNsYXNzQ2F0ZWdvcnkoJ0xpdmUnKTtcbn0pIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vJywge1xuICAgICAgICB1cmw6ICcvZGVtbycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvZGVtby9kZW1vLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRGVtb0NvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RvY3MnLCB7XG4gICAgICAgIHVybDogJy9kb2NzJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kb2NzL2RvY3MuaHRtbCdcbiAgICB9KTtcbn0pO1xuIiwiKGZ1bmN0aW9uICgpIHtcblxuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIEhvcGUgeW91IGRpZG4ndCBmb3JnZXQgQW5ndWxhciEgRHVoLWRveS5cbiAgICBpZiAoIXdpbmRvdy5hbmd1bGFyKSB0aHJvdyBuZXcgRXJyb3IoJ0kgY2FuXFwndCBmaW5kIEFuZ3VsYXIhJyk7XG5cbiAgICB2YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ2ZzYVByZUJ1aWx0JywgW10pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ1NvY2tldCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF3aW5kb3cuaW8pIHRocm93IG5ldyBFcnJvcignc29ja2V0LmlvIG5vdCBmb3VuZCEnKTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5pbyh3aW5kb3cubG9jYXRpb24ub3JpZ2luKTtcbiAgICB9KTtcblxuICAgIC8vIEFVVEhfRVZFTlRTIGlzIHVzZWQgdGhyb3VnaG91dCBvdXIgYXBwIHRvXG4gICAgLy8gYnJvYWRjYXN0IGFuZCBsaXN0ZW4gZnJvbSBhbmQgdG8gdGhlICRyb290U2NvcGVcbiAgICAvLyBmb3IgaW1wb3J0YW50IGV2ZW50cyBhYm91dCBhdXRoZW50aWNhdGlvbiBmbG93LlxuICAgIGFwcC5jb25zdGFudCgnQVVUSF9FVkVOVFMnLCB7XG4gICAgICAgIGxvZ2luU3VjY2VzczogJ2F1dGgtbG9naW4tc3VjY2VzcycsXG4gICAgICAgIGxvZ2luRmFpbGVkOiAnYXV0aC1sb2dpbi1mYWlsZWQnLFxuICAgICAgICBsb2dvdXRTdWNjZXNzOiAnYXV0aC1sb2dvdXQtc3VjY2VzcycsXG4gICAgICAgIHNlc3Npb25UaW1lb3V0OiAnYXV0aC1zZXNzaW9uLXRpbWVvdXQnLFxuICAgICAgICBub3RBdXRoZW50aWNhdGVkOiAnYXV0aC1ub3QtYXV0aGVudGljYXRlZCcsXG4gICAgICAgIG5vdEF1dGhvcml6ZWQ6ICdhdXRoLW5vdC1hdXRob3JpemVkJ1xuICAgIH0pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ0F1dGhJbnRlcmNlcHRvcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkcSwgQVVUSF9FVkVOVFMpIHtcbiAgICAgICAgdmFyIHN0YXR1c0RpY3QgPSB7XG4gICAgICAgICAgICA0MDE6IEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsXG4gICAgICAgICAgICA0MDM6IEFVVEhfRVZFTlRTLm5vdEF1dGhvcml6ZWQsXG4gICAgICAgICAgICA0MTk6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LFxuICAgICAgICAgICAgNDQwOiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KHN0YXR1c0RpY3RbcmVzcG9uc2Uuc3RhdHVzXSwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QocmVzcG9uc2UpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBhcHAuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyKSB7XG4gICAgICAgICRodHRwUHJvdmlkZXIuaW50ZXJjZXB0b3JzLnB1c2goW1xuICAgICAgICAgICAgJyRpbmplY3RvcicsXG4gICAgICAgICAgICBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRpbmplY3Rvci5nZXQoJ0F1dGhJbnRlcmNlcHRvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICBdKTtcbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciB1c2VyID0gcmVzcG9uc2UuZGF0YS51c2VyO1xuICAgICAgICAgICAgU2Vzc2lvbi5jcmVhdGUodXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiB1c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXNlcyB0aGUgc2Vzc2lvbiBmYWN0b3J5IHRvIHNlZSBpZiBhblxuICAgICAgICAvLyBhdXRoZW50aWNhdGVkIHVzZXIgaXMgY3VycmVudGx5IHJlZ2lzdGVyZWQuXG4gICAgICAgIHRoaXMuaXNBdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICEhU2Vzc2lvbi51c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZ2V0TG9nZ2VkSW5Vc2VyID0gZnVuY3Rpb24gKGZyb21TZXJ2ZXIpIHtcblxuICAgICAgICAgICAgLy8gSWYgYW4gYXV0aGVudGljYXRlZCBzZXNzaW9uIGV4aXN0cywgd2VcbiAgICAgICAgICAgIC8vIHJldHVybiB0aGUgdXNlciBhdHRhY2hlZCB0byB0aGF0IHNlc3Npb25cbiAgICAgICAgICAgIC8vIHdpdGggYSBwcm9taXNlLiBUaGlzIGVuc3VyZXMgdGhhdCB3ZSBjYW5cbiAgICAgICAgICAgIC8vIGFsd2F5cyBpbnRlcmZhY2Ugd2l0aCB0aGlzIG1ldGhvZCBhc3luY2hyb25vdXNseS5cblxuICAgICAgICAgICAgLy8gT3B0aW9uYWxseSwgaWYgdHJ1ZSBpcyBnaXZlbiBhcyB0aGUgZnJvbVNlcnZlciBwYXJhbWV0ZXIsXG4gICAgICAgICAgICAvLyB0aGVuIHRoaXMgY2FjaGVkIHZhbHVlIHdpbGwgbm90IGJlIHVzZWQuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQXV0aGVudGljYXRlZCgpICYmIGZyb21TZXJ2ZXIgIT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEud2hlbihTZXNzaW9uLnVzZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNYWtlIHJlcXVlc3QgR0VUIC9zZXNzaW9uLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIHVzZXIsIGNhbGwgb25TdWNjZXNzZnVsTG9naW4gd2l0aCB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgNDAxIHJlc3BvbnNlLCB3ZSBjYXRjaCBpdCBhbmQgaW5zdGVhZCByZXNvbHZlIHRvIG51bGwuXG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvc2Vzc2lvbicpLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dpbiA9IGZ1bmN0aW9uIChjcmVkZW50aWFscykge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJy9sb2dpbicsIGNyZWRlbnRpYWxzKVxuICAgICAgICAgICAgICAgIC50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKVxuICAgICAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QoeyBtZXNzYWdlOiAnSW52YWxpZCBsb2dpbiBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KCkpO1xuIiwiXG5hcHAuY29udHJvbGxlcignZ3JpZEN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkdWliTW9kYWwpIHtcdFxuXG5cdCRzY29wZS5vcGVuTW9kYWwgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHVpYk1vZGFsLm9wZW4oe1xuXHRcdFx0dGVtcGxhdGVVcmw6ICdqcy9ncmlkL21vZGFsQ29udGVudC5odG1sJ1xuXHRcdH0pXG5cdH1cbn0pXG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAvLyBSZWdpc3RlciBvdXIgKmFib3V0KiBzdGF0ZS5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbGFuZGluZycsIHtcbiAgICAgICAgdXJsOiAnLycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvbGFuZGluZy9sYW5kaW5nLmh0bWwnXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnbG9naW4nLCB7XG4gICAgICAgIHVybDogJy9sb2dpbicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvbG9naW4vbG9naW4uaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdMb2dpbkN0cmwnXG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignTG9naW5DdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgJHNjb3BlLmxvZ2luID0ge307XG4gICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG5cbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLic7XG4gICAgICAgIH0pO1xuXG4gICAgfTtcblxufSk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ21lbWJlcnNPbmx5Jywge1xuICAgICAgICB1cmw6ICcvbWVtYmVycy1hcmVhJyxcbiAgICAgICAgdGVtcGxhdGU6ICc8aW1nIG5nLXJlcGVhdD1cIml0ZW0gaW4gc3Rhc2hcIiB3aWR0aD1cIjMwMFwiIG5nLXNyYz1cInt7IGl0ZW0gfX1cIiAvPicsXG4gICAgICAgIGNvbnRyb2xsZXI6IGZ1bmN0aW9uICgkc2NvcGUsIFNlY3JldFN0YXNoKSB7XG4gICAgICAgICAgICBTZWNyZXRTdGFzaC5nZXRTdGFzaCgpLnRoZW4oZnVuY3Rpb24gKHN0YXNoKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnN0YXNoID0gc3Rhc2g7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBkYXRhLmF1dGhlbnRpY2F0ZSBpcyByZWFkIGJ5IGFuIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgIC8vIHRoYXQgY29udHJvbHMgYWNjZXNzIHRvIHRoaXMgc3RhdGUuIFJlZmVyIHRvIGFwcC5qcy5cbiAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgYXV0aGVudGljYXRlOiB0cnVlXG4gICAgICAgIH1cbiAgICB9KTtcblxufSk7XG5cbmFwcC5mYWN0b3J5KCdTZWNyZXRTdGFzaCcsIGZ1bmN0aW9uICgkaHR0cCkge1xuXG4gICAgdmFyIGdldFN0YXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvYXBpL21lbWJlcnMvc2VjcmV0LXN0YXNoJykudGhlbihmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5kYXRhO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0U3Rhc2g6IGdldFN0YXNoXG4gICAgfTtcblxufSk7XG4iLCJhcHAuZmFjdG9yeSgnRnVsbHN0YWNrUGljcycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICAnaHR0cHM6Ly9wYnMudHdpbWcuY29tL21lZGlhL0I3Z0JYdWxDQUFBWFFjRS5qcGc6bGFyZ2UnLFxuICAgICAgICAnaHR0cHM6Ly9mYmNkbi1zcGhvdG9zLWMtYS5ha2FtYWloZC5uZXQvaHBob3Rvcy1hay14YXAxL3QzMS4wLTgvMTA4NjI0NTFfMTAyMDU2MjI5OTAzNTkyNDFfODAyNzE2ODg0MzMxMjg0MTEzN19vLmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1MS1VzaElnQUV5OVNLLmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjc5LVg3b0NNQUFrdzd5LmpwZycsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1VajlDT0lJQUlGQWgwLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjZ5SXlGaUNFQUFxbDEyLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0UtVDc1bFdBQUFtcXFKLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0V2WkFnLVZBQUFrOTMyLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0VnTk1lT1hJQUlmRGhLLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0VReUlETldnQUF1NjBCLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0NGM1Q1UVc4QUUybEdKLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FlVnc1U1dvQUFBTHNqLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FhSklQN1VrQUFsSUdzLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0FRT3c5bFdFQUFZOUZsLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQi1PUWJWckNNQUFOd0lNLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjliX2Vyd0NZQUF3UmNKLnBuZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjVQVGR2bkNjQUVBbDR4LmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjRxd0MwaUNZQUFsUEdoLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQjJiMzN2UklVQUE5bzFELmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQndwSXdyMUlVQUF2TzJfLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQnNTc2VBTkNZQUVPaEx3LmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0o0dkxmdVV3QUFkYTRMLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0k3d3pqRVZFQUFPUHBTLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0lkSHZUMlVzQUFubkhWLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0dDaVBfWVdZQUFvNzVWLmpwZzpsYXJnZScsXG4gICAgICAgICdodHRwczovL3Bicy50d2ltZy5jb20vbWVkaWEvQ0lTNEpQSVdJQUkzN3F1LmpwZzpsYXJnZSdcbiAgICBdO1xufSk7XG4iLCJhcHAuZmFjdG9yeSgnUmFuZG9tR3JlZXRpbmdzJywgZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIGdldFJhbmRvbUZyb21BcnJheSA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgICAgICAgcmV0dXJuIGFycltNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnIubGVuZ3RoKV07XG4gICAgfTtcblxuICAgIHZhciBncmVldGluZ3MgPSBbXG4gICAgICAgICdIZWxsbywgd29ybGQhJyxcbiAgICAgICAgJ0F0IGxvbmcgbGFzdCwgSSBsaXZlIScsXG4gICAgICAgICdIZWxsbywgc2ltcGxlIGh1bWFuLicsXG4gICAgICAgICdXaGF0IGEgYmVhdXRpZnVsIGRheSEnLFxuICAgICAgICAnSVxcJ20gbGlrZSBhbnkgb3RoZXIgcHJvamVjdCwgZXhjZXB0IHRoYXQgSSBhbSB5b3Vycy4gOiknLFxuICAgICAgICAnVGhpcyBlbXB0eSBzdHJpbmcgaXMgZm9yIExpbmRzYXkgTGV2aW5lLicsXG4gICAgICAgICfjgZPjgpPjgavjgaHjga/jgIHjg6bjg7zjgrbjg7zmp5jjgIInLFxuICAgICAgICAnV2VsY29tZS4gVG8uIFdFQlNJVEUuJyxcbiAgICAgICAgJzpEJyxcbiAgICAgICAgJ1llcywgSSB0aGluayB3ZVxcJ3ZlIG1ldCBiZWZvcmUuJyxcbiAgICAgICAgJ0dpbW1lIDMgbWlucy4uLiBJIGp1c3QgZ3JhYmJlZCB0aGlzIHJlYWxseSBkb3BlIGZyaXR0YXRhJyxcbiAgICAgICAgJ0lmIENvb3BlciBjb3VsZCBvZmZlciBvbmx5IG9uZSBwaWVjZSBvZiBhZHZpY2UsIGl0IHdvdWxkIGJlIHRvIG5ldlNRVUlSUkVMIScsXG4gICAgXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGdyZWV0aW5nczogZ3JlZXRpbmdzLFxuICAgICAgICBnZXRSYW5kb21HcmVldGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGdldFJhbmRvbUZyb21BcnJheShncmVldGluZ3MpO1xuICAgICAgICB9XG4gICAgfTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignRGVtYW5kQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSkge1xuXHQkc2NvcGUuY2xhc3NlcyA9IGNsYXNzZXM7XG4gICRzY29wZS5zb3J0QnlUeXBlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICBpZighdHlwZSkgJHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzO1xuICAgIGVsc2Uge1xuICAgICAgJHNjb3BlLmNsYXNzZXMgPSBjbGFzc2VzLmZpbHRlcihmdW5jdGlvbiAodmlkZW8pIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvLlR5cGUgPT09IHR5cGVcbiAgICAgIH0pXG4gICAgICBcbiAgICB9XG4gIH1cbn0pXG5cbnZhciBjbGFzc2VzID0gW1xuICB7XG4gICAgXCJJRFwiOiAxLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIkFlcm9iaWMgQ2hhaXIgVmlkZW9cIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9tN3pDRGlpVEJUay9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9bTd6Q0RpaVRCVGtcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAyLFxuICAgIFwiVHlwZVwiOiBcIkNoYWlyXCIsXG4gICAgXCJUaXRsZVwiOiBcIlByaW9yaXR5IE9uZVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL09BNTVlTXlCOFMwL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1PQTU1ZU15QjhTMFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDMsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiTG93IEltcGFjdCBDaGFpciBBZXJvYmljc1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpLzJBdUxxWWg0aXJJL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj0yQXVMcVloNGlySVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDQsXG4gICAgXCJUeXBlXCI6IFwiQ2hhaXJcIixcbiAgICBcIlRpdGxlXCI6IFwiQWR2YW5jZWQgQ2hhaXIgRXhlcmNpc2VcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9PQzlWYnd5RUc4VS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9T0M5VmJ3eUVHOFVcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA1LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiR2VudGxlIFlvZ2FcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9HOEJzTGxQRTFtNC9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9RzhCc0xsUEUxbTRcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA2LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiR2VudGxlIGNoYWlyIHlvZ2Egcm91dGluZVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL0tFamlYdGIyaFJnL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1LRWppWHRiMmhSZ1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDcsXG4gICAgXCJUeXBlXCI6IFwiWW9nYVwiLFxuICAgIFwiVGl0bGVcIjogXCJXaGVlbGNoYWlyIFlvZ2FcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9GclZFMWEydmd2QS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9RnJWRTFhMnZndkFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiA4LFxuICAgIFwiVHlwZVwiOiBcIllvZ2FcIixcbiAgICBcIlRpdGxlXCI6IFwiRW5lcmdpemluZyBDaGFpciBZb2dhXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvazRTVDFqOVBmckEvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWs0U1QxajlQZnJBXCJcbiAgfSxcbiAge1xuICAgIFwiSURcIjogOSxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIkJhbGFuY2UgRXhlcmNpc2VcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS96LXRVSHVOUFN0dy9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9ei10VUh1TlBTdHdcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMCxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIkZhbGwgUHJldmVudGlvbiBFeGVyY2lzZXNcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9OSkRBb0JvbGRyNC9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9TkpEQW9Cb2xkcjRcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMSxcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIjcgQmFsYW5jZSBFeGVyY2lzZXNcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS92R2E1QzFRczhqQS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9dkdhNUMxUXM4akFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxMixcbiAgICBcIlR5cGVcIjogXCJGYWxsXCIsXG4gICAgXCJUaXRsZVwiOiBcIlBvc3R1cmFsIFN0YWJpbGl0eVwiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL3o2Sm9hSmdvZlQ4L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj16NkpvYUpnb2ZUOFwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDEzLFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiRWFzeSBRaWdvbmdcIixcbiAgICBcIkltYWdlVXJsXCI6XCJodHRwczovL2ltZy55b3V0dWJlLmNvbS92aS9BcFMxQ0xXTzBCUS9kZWZhdWx0LmpwZ1wiLFxuICAgIFwiWW91dHViZVwiOiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9QXBTMUNMV08wQlFcIlxuICB9LFxuICB7XG4gICAgXCJJRFwiOiAxNCxcbiAgICBcIlR5cGVcIjogXCJUYWkgQ2hpXCIsXG4gICAgXCJUaXRsZVwiOiBcIlRhaSBDaGkgZm9yIEJlZ2lubmVyc1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL1ZTZC1jbU9Fbm13L2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1WU2QtY21PRW5td1wiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE1LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiVGFpIENoaSBmb3IgU2VuaW9yc1wiLFxuICAgIFwiSW1hZ2VVcmxcIjpcImh0dHBzOi8vaW1nLnlvdXR1YmUuY29tL3ZpL1dWS0xKOEJ1VzhRL2RlZmF1bHQuanBnXCIsXG4gICAgXCJZb3V0dWJlXCI6IFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1XVktMSjhCdVc4UVwiXG4gIH0sXG4gIHtcbiAgICBcIklEXCI6IDE2LFxuICAgIFwiVHlwZVwiOiBcIlRhaSBDaGlcIixcbiAgICBcIlRpdGxlXCI6IFwiTG93IEltcGFjdCBUYWkgQ2hpXCIsXG4gICAgXCJJbWFnZVVybFwiOlwiaHR0cHM6Ly9pbWcueW91dHViZS5jb20vdmkvaGExRUY0WXl2VXcvZGVmYXVsdC5qcGdcIixcbiAgICBcIllvdXR1YmVcIjogXCJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWhhMUVGNFl5dlV3XCJcbiAgfVxuXTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5Pbi1EZW1hbmQnLCB7XG4gICAgICAgIHVybDogJy9vbi1kZW1hbmQnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRGVtYW5kL29uLWRlbWFuZC5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0RlbWFuZENvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb250cm9sbGVyKCdGcmllbmRzQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZSwgJGh0dHApIHtcblx0JHNjb3BlLmZyaWVuZHMgPSBmcmllbmRzLnNvcnQoY29tcGFyZSk7XG5cdCRzY29wZS5maW5kTmVhcmJ5ID0gZnVuY3Rpb24gKCkge1xuXHRcdCRzdGF0ZS5nbygnZGVtby5uZWFyYnknKVxuXHR9XG5cdCRzY29wZS5sZWFkZXJib2FyZCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc3RhdGUuZ28oJ2RlbW8uRnJpZW5kJylcblx0fVxuXHQkaHR0cC5nZXQoJ2h0dHBzOi8vcmFuZG9tdXNlci5tZS9hcGkvP3Jlc3VsdHM9NTAmZ2VuZGVyPWZlbWFsZScpXG5cdC50aGVuKGZ1bmN0aW9uIChyZXN1bHQpIHtcblx0XHRyZXR1cm4gcmVzdWx0LmRhdGEucmVzdWx0c1xuXHR9KVxuXHQudGhlbihmdW5jdGlvbiAoZGF0YSkge1xuXHRcdCRzY29wZS5uZWFyYnkgPSBkYXRhO1xuXHRcdGNvbnNvbGUubG9nKCRzY29wZS5uZWFyYnlbMV0pXG5cdH0pXG5cblx0JHNjb3BlLmZpbmRBZ2UgPSBmaW5kQWdlO1xuXHQkc2NvcGUuZmluZERpc3RhbmNlID0gZmluZERpc3RhbmNlO1xufSlcblxuXG5mdW5jdGlvbiBjb21wYXJlKGEsYikge1xuICBpZiAoYS5zY29yZSA8IGIuc2NvcmUpXG4gICAgcmV0dXJuIDE7XG4gIGlmIChhLnNjb3JlID4gYi5zY29yZSlcbiAgICByZXR1cm4gLTE7XG4gIHJldHVybiAwO1xufVxuXG52YXIgZnJpZW5kcyA9IFtcblx0e1xuXHRcdG5hbWU6ICdKb2huIEhhbmNvY2snLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwMC8xMDAnLFxuXHRcdHNjb3JlOiAyMFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NlYmFzdGlhbiBMb2ZncmVuJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMjAvMTIwJyxcblx0XHRzY29yZTogMjBcblx0XHRcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdEb25hbGQgVHJ1bXAnLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzExMC8xMTAnLFxuXHRcdHNjb3JlOiAzMlxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ0JpbGwgSGFkZXInLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwNS8xMDUnLFxuXHRcdHNjb3JlOiAyMVxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NhbHZhZG9yIERhbGknLFxuXHRcdGltYWdlOiAnaHR0cDovL2xvcmVtcGl4ZWwuY29tLzEwMS8xMDEnLFxuXHRcdHNjb3JlOiAyM1xuXHR9XG5dXG5cbnZhciBzdHJhbmdlcnMgPSBbXTtcblxuZnVuY3Rpb24gZmluZE5hbWUgKCkge1xuXHRyZXR1cm4gJ0JhcmJhcmEnO1xufVxuXG5mdW5jdGlvbiBmaW5kRGlzdGFuY2UgKCkge1xuXHRyZXR1cm4gTWF0aC5yb3VuZChNYXRoLnJhbmRvbSgpICogMTApICsgJyBNaWxlcyBBd2F5J1xufVxuXG5mdW5jdGlvbiBmaW5kQWdlIChwZXJzb24pIHtcblx0dmFyIGJpcnRoZGF5ID0gbmV3IERhdGUocGVyc29uLmRvYilcblx0dmFyIGFnZSA9IDIwMTYgLSBiaXJ0aGRheS5nZXRGdWxsWWVhcigpO1xuXHRyZXR1cm4gYWdlICsgJyBZZWFycyBZb3VuZyc7XG59XG5cblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLkZyaWVuZCcsIHtcbiAgICAgICAgdXJsOiAnL2ZyaWVuZHMnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRnJpZW5kcy9mcmllbmRzLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRnJpZW5kc0NvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5jb250cm9sbGVyKCdMaXZlQ29udHJvbGxlcicsIGZ1bmN0aW9uICgkc2NvcGUsICRjb21waWxlLCB1aUNhbGVuZGFyQ29uZmlnKSB7XG5cdFxuXHR2YXIgZGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgdmFyIGQgPSBkYXRlLmdldERhdGUoKTtcbiAgICB2YXIgbSA9IGRhdGUuZ2V0TW9udGgoKTtcbiAgICB2YXIgeSA9IGRhdGUuZ2V0RnVsbFllYXIoKTtcbiAgICBcbiAgICAkc2NvcGUuY2hhbmdlVG8gPSAnSHVuZ2FyaWFuJztcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBwdWxscyBmcm9tIGdvb2dsZS5jb20gKi9cbiAgICAkc2NvcGUuZXZlbnRTb3VyY2UgPSB7XG4gICAgICAgICAgICB1cmw6IFwiaHR0cDovL3d3dy5nb29nbGUuY29tL2NhbGVuZGFyL2ZlZWRzL3VzYV9fZW4lNDBob2xpZGF5LmNhbGVuZGFyLmdvb2dsZS5jb20vcHVibGljL2Jhc2ljXCIsXG4gICAgICAgICAgICBjbGFzc05hbWU6ICdnY2FsLWV2ZW50JywgICAgICAgICAgIC8vIGFuIG9wdGlvbiFcbiAgICAgICAgICAgIGN1cnJlbnRUaW1lem9uZTogJ0FtZXJpY2EvQ2hpY2FnbycgLy8gYW4gb3B0aW9uIVxuICAgIH07XG4gICAgLyogZXZlbnQgc291cmNlIHRoYXQgY29udGFpbnMgY3VzdG9tIGV2ZW50cyBvbiB0aGUgc2NvcGUgKi9cbiAgICAkc2NvcGUuZXZlbnRzID0gW1xuXHRcdFx0ICAgICAge3RpdGxlOiAnVGFpIENoaScsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQsIDkpLCB1cmw6J2h0dHA6Ly9nb29nbGUuY29tJ30sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdBZXJvYmljcyB3aXRoIFJpY2hhcmQnLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxMSksZW5kOiBuZXcgRGF0ZSh5LCBtLCBkIC0gMil9LFxuXHRcdFx0ICAgICAge2lkOiA5OTksdGl0bGU6ICdDaGFpciBFeGVyY2lzZXMgd2l0aCBDbGFpcicsc3RhcnQ6IG5ldyBEYXRlKHksIG0sIGQsIDE0LCAwKSxhbGxEYXk6IGZhbHNlfSxcblx0XHRcdCAgICAgIHtpZDogOTk5LHRpdGxlOiAnQmFsYW5jZSB3aXRoIEpvaG4nLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxNiwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgICB7dGl0bGU6ICdZb2dhIHdpdGggUGV0ZXInLHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCBkLCAxOSwgMCksYWxsRGF5OiBmYWxzZX0sXG5cdFx0XHQgICAgXTtcbiAgICAvKiBldmVudCBzb3VyY2UgdGhhdCBjYWxscyBhIGZ1bmN0aW9uIG9uIGV2ZXJ5IHZpZXcgc3dpdGNoICovXG4gICAgJHNjb3BlLmV2ZW50c0YgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgdGltZXpvbmUsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgcyA9IG5ldyBEYXRlKHN0YXJ0KS5nZXRUaW1lKCkgLyAxMDAwO1xuICAgICAgdmFyIGUgPSBuZXcgRGF0ZShlbmQpLmdldFRpbWUoKSAvIDEwMDA7XG4gICAgICB2YXIgbSA9IG5ldyBEYXRlKHN0YXJ0KS5nZXRNb250aCgpO1xuICAgICAgdmFyIGV2ZW50cyA9IFt7dGl0bGU6ICdGZWVkIE1lICcgKyBtLHN0YXJ0OiBzICsgKDUwMDAwKSxlbmQ6IHMgKyAoMTAwMDAwKSxhbGxEYXk6IGZhbHNlLCBjbGFzc05hbWU6IFsnY3VzdG9tRmVlZCddfV07XG4gICAgICBjYWxsYmFjayhldmVudHMpO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FsRXZlbnRzRXh0ID0ge1xuICAgICAgIGNvbG9yOiAnI2YwMCcsXG4gICAgICAgdGV4dENvbG9yOiAneWVsbG93JyxcbiAgICAgICBldmVudHM6IFsgXG4gICAgICAgICAge3R5cGU6J3BhcnR5Jyx0aXRsZTogJ0x1bmNoJyxzdGFydDogbmV3IERhdGUoeSwgbSwgZCwgMTIsIDApLGVuZDogbmV3IERhdGUoeSwgbSwgZCwgMTQsIDApLGFsbERheTogZmFsc2V9LFxuICAgICAgICAgIHt0eXBlOidwYXJ0eScsdGl0bGU6ICdMdW5jaCAyJyxzdGFydDogbmV3IERhdGUoeSwgbSwgZCwgMTIsIDApLGVuZDogbmV3IERhdGUoeSwgbSwgZCwgMTQsIDApLGFsbERheTogZmFsc2V9LFxuICAgICAgICAgIHt0eXBlOidwYXJ0eScsdGl0bGU6ICdDbGljayBmb3IgR29vZ2xlJyxzdGFydDogbmV3IERhdGUoeSwgbSwgMjgpLGVuZDogbmV3IERhdGUoeSwgbSwgMjkpLHVybDogJ2h0dHA6Ly9nb29nbGUuY29tLyd9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgJHNjb3BlLmV2ZW50Q2xpY2sgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgIGlmKGV2ZW50LnVybCkge1xuICAgICAgICB3aW5kb3cub3BlbihldmVudC51cmwpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8qIGFsZXJ0IG9uIGV2ZW50Q2xpY2sgKi9cbiAgICAkc2NvcGUuYWxlcnRPbkV2ZW50Q2xpY2sgPSBmdW5jdGlvbiggZGF0ZSwganNFdmVudCwgdmlldyl7XG4gICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoZGF0ZS50aXRsZSArICcgd2FzIGNsaWNrZWQgJyk7XG4gICAgfTtcbiAgICAvKiBhbGVydCBvbiBEcm9wICovXG4gICAgICRzY29wZS5hbGVydE9uRHJvcCA9IGZ1bmN0aW9uKGV2ZW50LCBkZWx0YSwgcmV2ZXJ0RnVuYywganNFdmVudCwgdWksIHZpZXcpe1xuICAgICAgICRzY29wZS5hbGVydE1lc3NhZ2UgPSAoJ0V2ZW50IERyb3BlZCB0byBtYWtlIGRheURlbHRhICcgKyBkZWx0YSk7XG4gICAgfTtcbiAgICAvKiBhbGVydCBvbiBSZXNpemUgKi9cbiAgICAkc2NvcGUuYWxlcnRPblJlc2l6ZSA9IGZ1bmN0aW9uKGV2ZW50LCBkZWx0YSwgcmV2ZXJ0RnVuYywganNFdmVudCwgdWksIHZpZXcgKXtcbiAgICAgICAkc2NvcGUuYWxlcnRNZXNzYWdlID0gKCdFdmVudCBSZXNpemVkIHRvIG1ha2UgZGF5RGVsdGEgJyArIGRlbHRhKTtcbiAgICB9O1xuICAgIC8qIGFkZCBhbmQgcmVtb3ZlcyBhbiBldmVudCBzb3VyY2Ugb2YgY2hvaWNlICovXG4gICAgJHNjb3BlLmFkZFJlbW92ZUV2ZW50U291cmNlID0gZnVuY3Rpb24oc291cmNlcyxzb3VyY2UpIHtcbiAgICAgIHZhciBjYW5BZGQgPSAwO1xuICAgICAgYW5ndWxhci5mb3JFYWNoKHNvdXJjZXMsZnVuY3Rpb24odmFsdWUsIGtleSl7XG4gICAgICAgIGlmKHNvdXJjZXNba2V5XSA9PT0gc291cmNlKXtcbiAgICAgICAgICBzb3VyY2VzLnNwbGljZShrZXksMSk7XG4gICAgICAgICAgY2FuQWRkID0gMTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZihjYW5BZGQgPT09IDApe1xuICAgICAgICBzb3VyY2VzLnB1c2goc291cmNlKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIC8qIGFkZCBjdXN0b20gZXZlbnQqL1xuICAgICRzY29wZS5hZGRFdmVudCA9IGZ1bmN0aW9uKCkge1xuICAgICAgJHNjb3BlLmV2ZW50cy5wdXNoKHtcbiAgICAgICAgdGl0bGU6ICdPcGVuIFNlc2FtZScsXG4gICAgICAgIHN0YXJ0OiBuZXcgRGF0ZSh5LCBtLCAyOCksXG4gICAgICAgIGVuZDogbmV3IERhdGUoeSwgbSwgMjkpLFxuICAgICAgICBjbGFzc05hbWU6IFsnb3BlblNlc2FtZSddXG4gICAgICB9KTtcbiAgICB9O1xuICAgIC8qIHJlbW92ZSBldmVudCAqL1xuICAgICRzY29wZS5yZW1vdmUgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgJHNjb3BlLmV2ZW50cy5zcGxpY2UoaW5kZXgsMSk7XG4gICAgfTtcbiAgICAvKiBDaGFuZ2UgVmlldyAqL1xuICAgICRzY29wZS5jaGFuZ2VWaWV3ID0gZnVuY3Rpb24odmlldyxjYWxlbmRhcikge1xuICAgICAgdWlDYWxlbmRhckNvbmZpZy5jYWxlbmRhcnNbY2FsZW5kYXJdLmZ1bGxDYWxlbmRhcignY2hhbmdlVmlldycsdmlldyk7XG4gICAgfTtcbiAgICAvKiBDaGFuZ2UgVmlldyAqL1xuICAgICRzY29wZS5yZW5kZXJDYWxlbmRlciA9IGZ1bmN0aW9uKGNhbGVuZGFyKSB7XG4gICAgICBpZih1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0pe1xuICAgICAgICB1aUNhbGVuZGFyQ29uZmlnLmNhbGVuZGFyc1tjYWxlbmRhcl0uZnVsbENhbGVuZGFyKCdyZW5kZXInKTtcbiAgICAgIH1cbiAgICB9O1xuICAgICAvKiBSZW5kZXIgVG9vbHRpcCAqL1xuICAgICRzY29wZS5ldmVudFJlbmRlciA9IGZ1bmN0aW9uKCBldmVudCwgZWxlbWVudCwgdmlldyApIHsgXG4gICAgICAgIGVsZW1lbnQuYXR0cih7J3Rvb2x0aXAnOiBldmVudC50aXRsZSxcbiAgICAgICAgICAgICAgICAgICAgICd0b29sdGlwLWFwcGVuZC10by1ib2R5JzogdHJ1ZX0pO1xuICAgICAgICAkY29tcGlsZShlbGVtZW50KSgkc2NvcGUpO1xuICAgIH07XG4gICAgLyogY29uZmlnIG9iamVjdCAqL1xuICAgICRzY29wZS51aUNvbmZpZyA9IHtcbiAgICAgIGNhbGVuZGFyOntcbiAgICAgICAgZGVmYXVsdFZpZXc6ICdhZ2VuZGFEYXknLFxuICAgICAgICBoZWlnaHQ6IDQ1MCxcbiAgICAgICAgZWRpdGFibGU6IHRydWUsXG4gICAgICAgIGhlYWRlcjp7XG4gICAgICAgICAgbGVmdDogJ3RpdGxlJyxcbiAgICAgICAgICBjZW50ZXI6ICdhZ2VuZGFEYXksIG1vbnRoLCBhZ2VuZGFXZWVrJyxcbiAgICAgICAgICByaWdodDogJ3RvZGF5IHByZXYsbmV4dCdcbiAgICAgICAgfSxcbiAgICAgICAgZXZlbnRDbGljazogJHNjb3BlLmFsZXJ0T25FdmVudENsaWNrLFxuICAgICAgICBldmVudERyb3A6ICRzY29wZS5hbGVydE9uRHJvcCxcbiAgICAgICAgZXZlbnRSZXNpemU6ICRzY29wZS5hbGVydE9uUmVzaXplLFxuICAgICAgICBldmVudFJlbmRlcjogJHNjb3BlLmV2ZW50UmVuZGVyXG4gICAgICB9XG4gICAgfTtcblxuICAgICRzY29wZS5jaGFuZ2VMYW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZigkc2NvcGUuY2hhbmdlVG8gPT09ICdIdW5nYXJpYW4nKXtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzID0gW1wiVmFzw6FybmFwXCIsIFwiSMOpdGbFkVwiLCBcIktlZGRcIiwgXCJTemVyZGFcIiwgXCJDc8O8dMO2cnTDtmtcIiwgXCJQw6ludGVrXCIsIFwiU3pvbWJhdFwiXTtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzU2hvcnQgPSBbXCJWYXNcIiwgXCJIw6l0XCIsIFwiS2VkZFwiLCBcIlN6ZVwiLCBcIkNzw7x0XCIsIFwiUMOpblwiLCBcIlN6b1wiXTtcbiAgICAgICAgJHNjb3BlLmNoYW5nZVRvPSAnRW5nbGlzaCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAkc2NvcGUudWlDb25maWcuY2FsZW5kYXIuZGF5TmFtZXMgPSBbXCJTdW5kYXlcIiwgXCJNb25kYXlcIiwgXCJUdWVzZGF5XCIsIFwiV2VkbmVzZGF5XCIsIFwiVGh1cnNkYXlcIiwgXCJGcmlkYXlcIiwgXCJTYXR1cmRheVwiXTtcbiAgICAgICAgJHNjb3BlLnVpQ29uZmlnLmNhbGVuZGFyLmRheU5hbWVzU2hvcnQgPSBbXCJTdW5cIiwgXCJNb25cIiwgXCJUdWVcIiwgXCJXZWRcIiwgXCJUaHVcIiwgXCJGcmlcIiwgXCJTYXRcIl07XG4gICAgICAgICRzY29wZS5jaGFuZ2VUbyA9ICdIdW5nYXJpYW4nO1xuICAgICAgfVxuICAgIH07XG4gICAgLyogZXZlbnQgc291cmNlcyBhcnJheSovXG4gICAgJHNjb3BlLmV2ZW50U291cmNlcyA9IFskc2NvcGUuZXZlbnRzLCAkc2NvcGUuZXZlbnRTb3VyY2UsICRzY29wZS5ldmVudHNGXTtcbiAgICAkc2NvcGUuZXZlbnRTb3VyY2VzMiA9IFskc2NvcGUuY2FsRXZlbnRzRXh0LCAkc2NvcGUuZXZlbnRzRiwgJHNjb3BlLmV2ZW50c107XG5cblx0JHNjb3BlLmNoYW5nZUNsYXNzQ2F0ZWdvcnkoJ0xpdmUnKTtcbn0pIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkZW1vLkxpdmUnLCB7XG4gICAgICAgIHVybDogJy9saXZlJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL0xpdmUvbGl2ZUNsYXNzZXMuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdMaXZlQ29udHJvbGxlcidcbiAgICB9KTtcblxufSk7XG4iLCJhcHAuY29udHJvbGxlcignVHJhaW5lckNvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGUpIHtcblx0JHNjb3BlLnRyYWluZXJzID0gdHJhaW5lcnMuc29ydCgpO1xufSlcblxudmFyIHRyYWluZXJzID0gW1xuXHR7XG5cdFx0bmFtZTogJ0pvaG4gSGFuY29jaycsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAwLzEwMCcsXG5cdFx0c3BlY2lhbGl0eTogJ0NoYWlyJ1xuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1NlYmFzdGlhbiBMb2ZncmVuJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMjAvMTIwJyxcblx0XHRzcGVjaWFsaXR5OiAnQ2hhaXInXG5cdFx0XG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnRG9uYWxkIFRydW1wJyxcblx0XHRpbWFnZTogJ2h0dHA6Ly9sb3JlbXBpeGVsLmNvbS8xMTAvMTEwJyxcblx0XHRzcGVjaWFsaXR5OiAnQWVyb2JpY3MnXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnQmlsbCBIYWRlcicsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTA1LzEwNScsXG5cdFx0c3BlY2lhbGl0eTogJ1BlcnNvbmFsIFRyYWluZXInXG5cdH0sXG5cdHtcblx0XHRuYW1lOiAnU2FsdmFkb3IgRGFsaScsXG5cdFx0aW1hZ2U6ICdodHRwOi8vbG9yZW1waXhlbC5jb20vMTAxLzEwMScsXG5cdFx0c3BlY2lhbGl0eTogXCJQaHlzaWNhbCBUaGVyYXBpc3RcIlxuXHR9XG5dXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2RlbW8uVHJhaW5lcicsIHtcbiAgICAgICAgdXJsOiAnL3RyYWluZXJzJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9kZW1vL1RyYWluZXJzL3RyYWluZXJzLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnVHJhaW5lckNvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyIsImFwcC5kaXJlY3RpdmUoJ2Z1bGxzdGFja0xvZ28nLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9jb21tb24vZGlyZWN0aXZlcy9mdWxsc3RhY2stbG9nby9mdWxsc3RhY2stbG9nby5odG1sJ1xuICAgIH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHt9LFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgICAgICAgICBzY29wZS5pdGVtcyA9IFtcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnSG9tZScsIHN0YXRlOiAnaG9tZScgfSxcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnQWJvdXQnLCBzdGF0ZTogJ2Fib3V0JyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEb2N1bWVudGF0aW9uJywgc3RhdGU6ICdkb2NzJyB9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdNZW1iZXJzIE9ubHknLCBzdGF0ZTogJ21lbWJlcnNPbmx5JywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICB9XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ3JhbmRvR3JlZXRpbmcnLCBmdW5jdGlvbiAoUmFuZG9tR3JlZXRpbmdzKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL3JhbmRvLWdyZWV0aW5nL3JhbmRvLWdyZWV0aW5nLmh0bWwnLFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHNjb3BlLmdyZWV0aW5nID0gUmFuZG9tR3JlZXRpbmdzLmdldFJhbmRvbUdyZWV0aW5nKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG59KTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGVtby5uZWFyYnknLCB7XG4gICAgICAgIHVybDogJy9uZWFyYnknLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2RlbW8vRnJpZW5kcy9uZWFyYnkvbmVhcmJ5Lmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnRnJpZW5kc0NvbnRyb2xsZXInXG4gICAgfSk7XG5cbn0pOyJdfQ==
