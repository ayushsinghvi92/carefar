app.controller('FriendsController', function ($scope, $state) {
	$scope.friends = friends.sort(compare);
	$scope.findNearby = function () {
		$state.go('demo.nearby')
	}
	$scope.leaderboard = function () {
		$state.go('demo.Friend')
	}
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

