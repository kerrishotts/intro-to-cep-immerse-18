// don't pollute the global namespace!
(function () {

    // we have to create a new instance of CSInterface in order to communicate
    // with the host application
    const host = new CSInterface();

    // Create a promisified version of evalScript to make our lives a bit easier
    // -- this lets us use async/await below.
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

    // wait until the DOM is ready before proceeding
    document.addEventListener("DOMContentLoaded", () => {

        // find all the tabs in our panel
        const tabs = Array.from(document.querySelectorAll(".tab"));

        // find all the associated pages
        const pages = Array.from(document.querySelectorAll(".page"));

        // set up tab event handlers
        tabs.forEach((tab) => {
            // each tab indicates which page it controls
            const pageForTab = tab.dataset.for;
            const curTab = tab;

            // whenever a tab is clicked, we do two things:
            // 1. for all tabs, set `data-selected` to yes or no, depending
            //    on if the tab in question was the tab that was clicked
            // 2. for all pages, set `display` to `flex` or `none` depending
            //    on if the page was controlled by the clicked tab (`flex`)
            //    or not (`none`)
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

        // wire up page 1's interactive controls
        // page 1 is just an example showing that the panel has a webview,
        // and can do whatever you can do in a webview
        const fetchButton = document.querySelector("#fetch");
        fetchButton.addEventListener("click", async evt => {

            // get the input field for our location
            const locEl = document.querySelector("#loc");

            // get the output div
            const output = document.querySelector("#output");

            // get the actual location from the input field
            const location = locEl.value;

            // ask for the current temperature in that location
            const temp = await fetchWeather(location);

            // show this to the user
            output.textContent = temp;
        });

        // wire up page 2
        // page 2 is where the magic happens and we invoke extendscript

        // control the visibility of the Location input based on the mode the
        // user wants to be in
        const modeEl = document.querySelector("#mode");
        modeEl.addEventListener("change", () => {
            const locEl = document.querySelector("#location");
            const locElParent = document.querySelector("#create");
            const mode = modeEl.value;
            if (mode === "create") {
                locElParent.style.display = 'flex'; // show the location
            } else {
                locElParent.style.display = 'none'; // hide it
            }
        });

        const goButton = document.querySelector("#go");
        goButton.addEventListener("click", async evt => {

            // get the current mode -- we have "create", "selected", and "all"
            // the mode determines what clicking "go" will do.
            const modeEl = document.querySelector("#mode");
            const mode = modeEl.value;

            // get the location element in case we need it
            const locEl = document.querySelector("#location");
            switch (mode) {
                case "create":
                    {
                        const location = locEl.value;
                        // get the current temperature
                        const temp = await fetchWeather(location);

                        // and use extend script to add the tempoerature to the canvas
                        host.execute(`addTextLayer('${temp}°', 'WX: ${location}');`);
                    }
                    break;
                case "selected":
                case "all":
                default:
                    {
                        // the location will be in the active document, so we need to extract
                        // the ids and text layer names
                        const locations = JSON.parse(await host.execute(`getTextLayerIdsAndNames('${mode}');`));

                        // now get the temperatures for all the selected text fields (only if
                        // they start with "WX: ")
                        const temps = await Promise.all(locations.map(async ([id, item]) => {
                            if (item.startsWith("WX: ")) {
                                const location = item.substr(4);
                                const temp = await fetchWeather(location);
                                return [id, `${temp}°`];
                            } else {
                                return [id, undefined];
                            }
                        }));

                        // once we get all the temperatures, update the associated text layers
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


    //
    // WEATHER - RELATED FUNCTiONS
    ////////////////////////////////////////////////////////////////////////////
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