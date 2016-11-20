app.controller('DemoController', function ($scope, $state) {
	
	$scope.changeClassCategory = function (category) {
		$scope.classCategory = category;
		$state.go('demo.'+category)
	}

	$scope.changeClassCategory('Live');
})