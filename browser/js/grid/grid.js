app.controller('modalCtrl', function (content, $scope) {
	$scope.content = content;	
})

app.controller('gridCtrl', function ($scope, $uibModal) {	
	var findContent = function (parentName) {
		return allContent[parentName]
	}
	$scope.openModal = function (parentName) {
		$uibModal.open({
			templateUrl: 'js/grid/modalContent.html',
			controller: 'modalCtrl'
		})
	}
})

