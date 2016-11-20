app.config(function ($stateProvider) {

    // Register our *about* state.
    $stateProvider.state('landing', {
        url: '/',
        templateUrl: 'js/landing/landing.html'
    });

});