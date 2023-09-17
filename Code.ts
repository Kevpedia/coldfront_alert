interface Forecast {
  cod: string;
  message: number;
  cnt: number;
  list: {
    dt: number;
    main: {
      temp: number;
      feels_like: number;
      temp_min: number;
      temp_max: number;
      pressure: number;
      sea_level: number;
      grnd_level: number;
      humidity: number;
      temp_kf: number;
    };
    weather: [
      {
        id: number;
        main: string;
        description: string;
        icon: string;
      }
    ];
    clouds: {
      all: number;
    };
    wind: {
      speed: number;
      deg: number;
      gust: number;
    };
    visibility: number;
    pop: number;
    sys: {
      pod: string;
    };
    dt_txt: string;
  }[];
  city: {
    id: number;
    name: string;
    coord: {
      lat: number;
      lon: number;
    };
    country: string;
    population: number;
    timezone: number;
    sunrise: number;
    sunset: number;
  };
}

function checkAndAlert() {
  const forecast: Forecast = getForecast();
  const THRESHOLDS = {
    lowsBelow: +PropertiesService.getScriptProperties().getProperty(
      'RECORD_LOW_ROUNDED_UP'
    ),
    highsBelow: +PropertiesService.getScriptProperties().getProperty(
      'RECORD_LOW_HIGH_ROUNDED_UP'
    ),
  };
  const dailyMinTemps = aggregateMinTemperatures(forecast);
  const lowestMin = dailyMinTemps.reduce((minThusFar, current) => {
    return current < minThusFar ? current : minThusFar;
  });
  Logger.log(`daily mins: ${dailyMinTemps.join()}; lowest = ${lowestMin}`);
  const dailyMaxTemps = aggregateMaxTemperatures(forecast);
  const highestMax = dailyMaxTemps.reduce((maxThusFar, current) => {
    return current > maxThusFar ? current : maxThusFar;
  });
  const lowestMax = dailyMaxTemps.reduce((minThusFar, current) => {
    return current < minThusFar ? current : minThusFar;
  });
  Logger.log(
    `daily maxes: ${dailyMaxTemps.join()}; highest = ${highestMax}; lowest = ${lowestMax}`
  );
  const forecastHasColdFront = hasColdFront(dailyMinTemps);
  Logger.log(
    `${dailyMinTemps.length} day forecast for ${forecast.city.name} ${
      forecastHasColdFront
        ? 'has a cold front (yay! 🍂🍁🎃)'
        : "doesn't have a cold front (unfortunately)"
    }`
  );
  if (forecastHasColdFront) {
    notifyOfColdFront();
  }
  const lowestMinIsBelowThis = roundUpNearestTen(lowestMin);
  Logger.log(`Lowest Low is Below ${lowestMinIsBelowThis}`);
  if (lowestMinIsBelowThis < THRESHOLDS.lowsBelow) {
    PropertiesService.getScriptProperties().setProperty(
      'RECORD_LOW_ROUNDED_UP',
      lowestMinIsBelowThis.toFixed(0)
    );
    notifyOfRecord('low', lowestMinIsBelowThis);
  }
  const lowestHighIsBelowThis = roundUpNearestTen(lowestMax);
  Logger.log(`Lowest High is Below ${lowestHighIsBelowThis}`);
  if (lowestHighIsBelowThis < THRESHOLDS.highsBelow) {
    PropertiesService.getScriptProperties().setProperty(
      'RECORD_LOW_HIGH_ROUNDED_UP',
      lowestHighIsBelowThis.toFixed(0)
    );
    notifyOfRecord('high', lowestHighIsBelowThis);
  }
  return;
}
function roundUpNearestTen(number: number): number {
  if (typeof number != 'number') {
    throw `value "${number}" (type=${typeof number}) is not a number`;
  }
  return Math.ceil(number / 10) * 10;
}
function getForecast(): Forecast {
  try {
    const API_KEY =
      PropertiesService.getScriptProperties().getProperty('OPENWEATHERKEY');
    const LAT = PropertiesService.getScriptProperties().getProperty('LAT');
    const LONG = PropertiesService.getScriptProperties().getProperty('LONG');
    const URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LONG}&units=imperial&appid=${API_KEY}`;
    const response = UrlFetchApp.fetch(URL, {
      method: 'get',
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    if (code != 200) {
      throw `code ${code}: ${response.getContentText()}`;
    }
    const forecast: Forecast = JSON.parse(response.getContentText());
    return forecast;
  } catch (e) {
    Logger.log(`error getting forecast: ${e}`);
  }
}
function aggregateMinTemperatures(hourlyForecast: Forecast): number[] {
  const forecastArray = hourlyForecast.list;
  // Create an empty object to store the lowest temp_min values for each date.
  var minTemperaturesByDate = {};

  // Iterate through the forecastArray and update the minTemperaturesByDate object.
  for (var i = 0; i < forecastArray.length; i++) {
    var forecast = forecastArray[i];
    var date = new Date(forecast.dt * 1000).toDateString(); // Convert epoch time to date string

    if (
      !minTemperaturesByDate[date] ||
      forecast.main.temp_min < minTemperaturesByDate[date]
    ) {
      minTemperaturesByDate[date] = forecast.main.temp_min;
    }
  }

  // Convert the values from the minTemperaturesByDate object to an array.
  var minTemperaturesArray = [];
  for (var date in minTemperaturesByDate) {
    minTemperaturesArray.push(Math.round(minTemperaturesByDate[date]));
  }

  return minTemperaturesArray;
}
function aggregateMaxTemperatures(hourlyForecast: Forecast): number[] {
  const forecastArray = hourlyForecast.list;
  // Create an empty object to store the lowest temp_min values for each date.
  let maxTemperaturesByDate = {};

  // Iterate through the forecastArray and update the minTemperaturesByDate object.
  for (var i = 0; i < forecastArray.length; i++) {
    const forecast = forecastArray[i];
    const date = new Date(forecast.dt * 1000).toDateString(); // Convert epoch time to date string

    if (
      !maxTemperaturesByDate[date] ||
      forecast.main.temp_max > maxTemperaturesByDate[date]
    ) {
      maxTemperaturesByDate[date] = forecast.main.temp_max;
    }
  }

  // Convert the values from the minTemperaturesByDate object to an array.
  var minTemperaturesArray = [];
  for (var date in maxTemperaturesByDate) {
    const forecastsForSameDate = forecastArray.filter(
      (section) => new Date(section.dt * 1000).toDateString() === date
    ).length;
    const NUM_FORECASTS_PER_DAY = 8; // 24 hours/3-hour-forecast sections
    if (forecastsForSameDate === NUM_FORECASTS_PER_DAY) {
      // only include full days to avoid false "record-low highs"
      minTemperaturesArray.push(Math.round(maxTemperaturesByDate[date]));
    }
  }

  return minTemperaturesArray;
}

function hasColdFront(dailyMinimumTemps: number[]): boolean {
  const THRESHOLD: number =
    +PropertiesService.getScriptProperties().getProperty('THRESHOLD');
  const coldDrops = dailyMinimumTemps.filter((forecasted, index) => {
    if (index > 0) {
      const previousDate = dailyMinimumTemps[index - 1];
      return previousDate - forecasted >= THRESHOLD;
    }
    return false;
  });
  return coldDrops.length > 0;
}
function notifyOfColdFront() {
  const TOKEN =
    PropertiesService.getScriptProperties().getProperty('PUSHBULLETKEY');
  const URL = 'https://api.pushbullet.com/v2/pushes';
  const note = {
    type: 'file',
    title: '🍂🍁 Cold Front! 🍂🍁',
    body: "There's a cold front in the 5 day forecast! 🎉",
    file_name: 'giphy.webp',
    file_type: 'image/webp',
    file_url: 'https://i.giphy.com/media/huJmPXfeir5JlpPAx0/giphy.webp',
  };
  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    headers: {
      'Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    method: 'post',
    payload: JSON.stringify(note),
  };
  UrlFetchApp.fetch(URL, params);
  return;
}
function notifyOfRecord(type: 'low' | 'high', thresholdCrossed: number) {
  const TOKEN =
    PropertiesService.getScriptProperties().getProperty('PUSHBULLETKEY');
  const URL = 'https://api.pushbullet.com/v2/pushes';
  const note = {
    type: 'note',
    title: '❄️ New Cold Record ❄️',
    body: `We're forecasted to get out first ${type} below ${thresholdCrossed}°!`,
  };
  const params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    headers: {
      'Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    method: 'post',
    payload: JSON.stringify(note),
  };
  UrlFetchApp.fetch(URL, params);
  return;
}
