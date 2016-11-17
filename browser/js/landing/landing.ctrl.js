app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('landing', {
        url: '/',
        controller: 'LandingController',
        templateUrl: 'js/landing/landing.html'
    });

});