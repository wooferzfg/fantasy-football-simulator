const _ = require('lodash');
const gaussian = require('gaussian');
const toPercent = require('decimal-to-percent');

const data = require('./data');

const divisionOfTeam = (team) => {
  return _.find(data.divisions, (division) => _.includes(division, team));
}

const getPoints = (projection, variance) => {
  const distribution = gaussian(projection, variance);
  const randNum = Math.random();
  return Math.round(distribution.ppf(randNum));
}

const getResultForTeam = (team) => {
  return {
    team: team.team,
    points: getPoints(team.projected, team.variance)
  };
}

const simulateMatchup = (matchup, results) => {
  const matchupResults = _.map(matchup, getResultForTeam);

  const { team: team1, points: points1 } = matchupResults[0];
  const { team: team2, points: points2 } = matchupResults[1];

  const division1 = divisionOfTeam(team1);
  const division2 = divisionOfTeam(team2);

  results[team1].points += points1;
  results[team2].points += points2;

  if (points1 === points2) {
    results[team1].wins += 0.5;
    results[team2].wins += 0.5;
    if (division1 === division2) {
      results[team1].divisionWins += 0.5;
      results[team2].divisionWins += 0.5;
    }
  } else if (points1 > points2) {
    results[team1].wins += 1;
    if (division1 === division2) {
      results[team1].divisionWins += 1;
    }
  } else {
    results[team2].wins += 1;
    if (division1 === division2) {
      results[team2].divisionWins += 1;
    }
  }
}

const calculateWinner = (teams, results, criteria) => {
  const allCriteria = (team, otherTeam, upToCriteria) => {
    let criteriaMet = true;
    const teamResult = results[team];
    const otherResult = results[otherTeam];

    for (let i = 0; i < upToCriteria; i++) {
      const curCriteria = criteria[i];
      criteriaMet = criteriaMet && curCriteria(teamResult) >= curCriteria(otherResult);
    }

    const lastCriteria = criteria[upToCriteria];
    return criteriaMet && lastCriteria(teamResult) > lastCriteria(otherResult);
  };

  return _.find(teams, (team) =>
    _.every(teams, (otherTeam) => {
      if (team === otherTeam) {
        return true;
      }
      for (let i = 0; i < criteria.length; i++) {
        const criteriaMet = allCriteria(team, otherTeam, i);
        if (criteriaMet) {
          return criteriaMet;
        }
      }
      return false;
    })
  );
}

const divisionCriteria = [
  (teamResult) => teamResult.wins,
  (teamResult) => teamResult.divisionWins,
  (teamResult) => teamResult.points,
  (teamResult) => _.indexOf(_.keys(data.teams), teamResult.team)
];

const wildcardCriteria = [
  (teamResult) => teamResult.wins,
  (teamResult) => teamResult.points,
  (teamResult) => _.indexOf(_.keys(data.teams), teamResult.team)
];

const simulate = () => {
  const results = _.cloneDeep(data.teams);

  _.forEach(data.matchups, (matchup) => {
    simulateMatchup(matchup, results);
  });

  const divisionWinners = _.map(data.divisions, (division) =>
    calculateWinner(division, results, divisionCriteria)
  );

  let sortedDivisionWinners = [];
  for (let i = 0; i < _.size(data.divisions); i++) {
    const divisionWinnerTeams = _.filter(divisionWinners, (team) => !_.includes(sortedDivisionWinners, team));
    const sortedDivisionWinner = calculateWinner(divisionWinnerTeams, results, wildcardCriteria);
    sortedDivisionWinners.push(sortedDivisionWinner);
  }

  let wildcardWinners = [];
  for (let i = 0; i < data.wildcards; i++) {
    const wildcardTeams = _.filter(_.keys(data.teams), (team) => !_.includes(divisionWinners, team) && !_.includes(wildcardWinners, team));
    const wildcardWinner = calculateWinner(wildcardTeams, results, wildcardCriteria);
    wildcardWinners.push(wildcardWinner);
  }

  return _.concat(sortedDivisionWinners, wildcardWinners);
}

const initializeOutput = () => {
  return _.reduce(data.teams, (output, teamData) => {
    const team = teamData.team;
    output[team] = {
      seeds: {},
      missed: 0
    };
    for (let i = 0; i < data.wildcards + _.size(data.divisions); i++) {
      output[team].seeds[i + 1] = 0;
    }
    return output;
  }, {});
}

const runSimulations = () => {
  _.forEach(data.teams, (teamData, team) => {
    teamData.team = team;
  });

  const TOTAL_SIMS = 1000000;

  const output = initializeOutput();
  for (let i = 0; i < TOTAL_SIMS; i++) {
    const results = simulate();
    _.forEach(data.teams, (teamData) => {
      const team = teamData.team;
      const seed = _.indexOf(results, team);
      if (seed < 0) {
        output[team].missed += 1;
      } else {
        output[team].seeds[seed + 1] += 1;
      }
    });
  }

  _.forEach(output, (outputData, team) => {
    console.log(`--- ${team} ---`);
    console.log();

    const madePlayoffs = _.sum(_.values(outputData.seeds));
    console.log(`Made playoffs: ${toPercent(madePlayoffs / TOTAL_SIMS)}`);

    const firstRoundBye = outputData.seeds[1] + outputData.seeds[2];
    console.log(`First round bye: ${toPercent(firstRoundBye / TOTAL_SIMS)}`);
    console.log();

    _.forEach(outputData.seeds, (seedData, index) => {
      console.log(`Seed ${index}: ${toPercent(seedData / TOTAL_SIMS)}`);
    });

    console.log();
  });
}

runSimulations();
