(function () {

    const host = new CSInterface();

    host.execute = function (script) {
        return new Promise((resolve, reject) => {
            this.evalScript(script, r => {
                if (r === 'EvalScript error.') {
                    reject();
                }
                resolve(r);
            })
        });
    };

    document.addEventListener("DOMContentLoaded", () => {
        const tabs = Array.from(document.querySelectorAll(".tab"));
        const pages = Array.from(document.querySelectorAll(".page"));

        // set up tab event handlers
        tabs.forEach((tab) => {
            const pageForTab = tab.dataset.for;
            const curTab = tab;
            tab.addEventListener("click", evt => {
                tabs.forEach(tab => {
                    tab.dataset.selected = tab === curTab ? "yes" : "no";
                });
                pages.forEach((page) => {
                    const id = page.id;
                    page.style.display = id === pageForTab ? "flex" : "none";
                });
            });
        });

        // show first page
        pages[0].style.display = "flex";

        // wire up page 1
        const fetchButton = document.querySelector("#fetch");
        fetchButton.addEventListener("click", async evt => {
            const locEl = document.querySelector("#loc");
            const output = document.querySelector("#output");
            const location = locEl.value;
            const temp = await fetchWeather(location);
            output.textContent = temp;
        });

        // wire up page 2
        const goButton = document.querySelector("#go");
        goButton.addEventListener("click", async evt => {
            const modeEl = document.querySelector("#mode");
            const mode = modeEl.value;
            const locEl = document.querySelector("#location");
            switch (mode) {
                case "create":
                    {
                        const location = locEl.value;
                        const temp = await fetchWeather(location);
                        host.execute(`addTextLayer('${temp}°', 'WX: ${location}');`);
                    }
                    break;
                case "selected":
                case "all":
                default:
                    {
                        const locations = JSON.parse(await host.execute(`
arrayToString(map(${mode === 'all' ? "getAllLayerIds" : "getAllSelectedLayerIds"}(isTextLayer), function(id) {
    var layer = getLayerWithId(id);
    return [ id, layer.name ];
    }));
                        `));
                        const temps = await Promise.all(locations.map(async ([id, item]) => {
                            if (item.startsWith("WX: ")) {
                                const location = item.substr(4);
                                const temp = await fetchWeather(location);
                                return [id, `${temp}°`];
                            } else {
                                return [id, undefined];
                            }
                        }));
                        await Promise.all(temps.map(([id, text]) => {
                            if (text) {
                                return host.execute(`updateTextLayerWithId(${id}, "${text}");`);
                            } else {
                                return Promise.resolve();
                            }
                        }));
                    }
            }
        })

    });


    // weather-related methods
    function query(yql) {
        const encodedYql = encodeURIComponent(yql);
        const url = `https://query.yahooapis.com/v1/public/yql?q=${encodedYql}&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys`;

        return new Promise((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.onload = () => {
                if (req.status === 200) {
                    try {
                        resolve(JSON.parse(req.response));
                    } catch (err) {
                        reject(`Couldn't parse response. ${err.message}, ${req.response}`);
                    }
                } else {
                    reject(`Request had an error: ${req.status}`);
                }
            }
            req.onerror = reject;
            req.onabort = reject;
            req.open('GET', url);
            req.send();
        });
    }

    async function yqlWeatherAdapter(place, unit = "f") {
        const yql = `select * from weather.forecast where woeid in (select woeid from geo.places(1) where text="${place}") and u="${unit}"`;
        const weatherData = {
            place,
            unit,
            ok: false
        };

        try {
            const data = await query(yql);
            if (data.query.count > 0) {
                return Object.assign({}, weatherData, {
                    ok: true,
                    current: {
                        wind: {
                            speed: data.query.results.channel.wind.speed,
                            direction: data.query.results.channel.wind.direction
                        },
                        humidity: data.query.results.channel.atmosphere.humidity,
                        pressure: data.query.results.channel.atmosphere.pressure,
                        temperature: data.query.results.channel.item.condition.temp,
                        feelsLike: data.query.results.channel.wind.chill,
                        description: data.query.results.channel.item.condition.text,
                        when: data.query.results.channel.item.condition.date
                    },
                    forecast: data.query.results.channel.item.forecast.map(forecast => ({
                        when: forecast.date,
                        dayOfWeek: forecast.day,
                        high: forecast.high,
                        low: forecast.low,
                        description: forecast.text
                    }))
                });
            } else {
                return Object.assign({}, weatherData, {
                    msg: "No data found for the location"
                });
            }
        } catch (err) {
            return Object.assign({}, weatherData, {
                msg: err.message,
                error: err
            });
        }
    }

    async function fetchWeather(location) {
        return (await yqlWeatherAdapter(location)).current.temperature;
    }

})();