app.controller('DemoController', function ($scope, $state) {
	console.log('hitting this')
	
	$scope.classCategory = 'Live';
	$scope.changeClassCategory = function (category) {
		$scope.classCategory = category;
		$state.go('demo.'+category)
	}
})