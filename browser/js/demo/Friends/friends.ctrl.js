app.controller('FriendsController', function ($scope, $state, $http) {
	$scope.friends = friends.sort(compare);
	$scope.findNearby = function () {
		$state.go('demo.nearby')
	}
	$scope.leaderboard = function () {
		$state.go('demo.Friend')
	}
	$http.get('https://randomuser.me/api/?results=50&gender=female')
	.then(function (result) {
		return result.data.results
	})
	.then(function (data) {
		$scope.nearby = data;
		console.log($scope.nearby[1])
	})
})


function compare(a,b) {
  if (a.score < b.score)
    return 1;
  if (a.score > b.score)
    return -1;
  return 0;
}

var friends = [
	{
		name: 'John Hancock',
		image: 'http://lorempixel.com/100/100',
		score: 20
	},
	{
		name: 'Sebastian Lofgren',
		image: 'http://lorempixel.com/120/120',
		score: 20
		
	},
	{
		name: 'Donald Trump',
		image: 'http://lorempixel.com/110/110',
		score: 32
	},
	{
		name: 'Bill Hader',
		image: 'http://lorempixel.com/105/105',
		score: 21
	},
	{
		name: 'Salvador Dali',
		image: 'http://lorempixel.com/101/101',
		score: 23
	}
]

var strangers = [];

function findName () {
	return 'Barbara';
}

function findDistance () {
	return Math.random() * 10 + ' Miles Away'
}

function findAge (person) {
	return 62;
}

