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
			resolve: {
				content : function () {
					return findContent(parentName)
				}
			},
			controller: 'modalCtrl'
		})
	}
})

var allContent = {
	"fallDetection" : {
		title: "Automatic Fall Detection",
		body: "Smart phones have sophisticated sensors and systems built in that can be used to detect very granular movements.  Our app uses these sensors to detect if someone may have fallen and can run in the background."
	},
	"notifyFamily" : {
		title: "Notify Family",
		body: "Up to 5 family members or caregivers can be signed-up to receive email notifications in the free app.  To enable SMS notification and automated phone-calls, please sign up for the PRO version of the app.  More family members can also be added in the PRO version."
	},
	"emergencyButton" : {
		title: "Emergency Button",
		body: "If the elder is in an uncomfortable, or worse, an unsafe situation, they can quickly alert their family without having to dial individual phone numbers.  Whether it’s because of suspicious people around the home, or because the elder fell and is struggling to get up, the elder can let a group of people know right away."
	},
	"easeOfUse" : {
		title: "Ease of Setup and Use",
		body: "The phone battery is minimally impacted due to the app. If the user also uses the phone for multiple uses, such as communications and entertainment, we advise the phone be left to charge when not used for fall detection."
	},
	"coverage" : {
		title: "24 x 7 Coverage",
		body:"Up to 5 family members or caregivers can be signed-up to receive email notifications in the free app.  To enable SMS notification and automated phone-calls, please sign up for the PRO version of the app.  More family members can also be added in the PRO version."
	},
	"free" : {
		title: "Free!",
		body: "Up to 5 family members or caregivers can be signed-up to receive email notifications in the free app.  To enable SMS notification and automated phone-calls, please sign up for the PRO version of the app.  More family members can also be added in the PRO version."
	}
}