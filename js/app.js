// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => console.log('ServiceWorker registered'))
        .catch(err => console.log('ServiceWorker registration failed: ', err));
}

class WeatherApp {
    constructor() {
        this.weatherInfo = document.getElementById('weather-info');
        this.loadingContainer = document.querySelector('.loading-container');
        this.contentContainer = document.querySelector('.content-container');
        this.loadingText = document.getElementById('loading-text');
        this.searchContainer = document.getElementById('search-container');
        this.citySearchInput = document.getElementById('city-search');
        this.autocompleteResults = document.getElementById('autocomplete-results');
        this.searchCloseBtn = document.getElementById('search-close');
        this.apiKey = CONFIG.OPENCAGE_API_KEY;
        
        // Create and append search loading indicator
        this.searchLoading = document.createElement('div');
        this.searchLoading.className = 'search-loading';
        const searchInputWrapper = document.querySelector('.search-input-wrapper');
        if (searchInputWrapper) {
            searchInputWrapper.appendChild(this.searchLoading);
        }
        
        this.debounceTimer = null;
        this.currentLocation = null;
        this.init();
    }

    showLoading(message) {
        this.loadingText.textContent = message;
        this.loadingContainer.classList.add('active');
        this.contentContainer.classList.add('loading');
    }

    hideLoading() {
        this.loadingContainer.classList.remove('active');
        this.contentContainer.classList.remove('loading');
    }

    async init() {
        if (!this.apiKey) {
            this.weatherInfo.textContent = 'Error: API key not configured';
            return;
        }
        
        this.setupEventListeners();
        await this.getCurrentLocation();
    }

    setupEventListeners() {
        // Close search when clicking outside
        document.addEventListener('click', (e) => {
            if (this.searchContainer && 
                !this.searchContainer.contains(e.target) && 
                !e.target.closest('#location-button')) {
                this.closeSearch();
            }
        });

        if (this.searchCloseBtn) {
            this.searchCloseBtn.addEventListener('click', () => this.closeSearch());
        }

        if (this.citySearchInput) {
            this.citySearchInput.addEventListener('input', () => {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => this.handleSearchInput(), 300);
            });

            this.citySearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.citySearchInput.value.trim()) {
                    this.searchCity(this.citySearchInput.value.trim());
                }
            });
        }
    }

    showSearchLoading() {
        if (this.searchLoading && this.citySearchInput) {
            this.searchLoading.classList.add('active');
            this.citySearchInput.classList.add('loading');
        }
    }

    hideSearchLoading() {
        if (this.searchLoading && this.citySearchInput) {
            this.searchLoading.classList.remove('active');
            this.citySearchInput.classList.remove('loading');
        }
    }

    async handleSearchInput() {
        const query = this.citySearchInput.value.trim();
        if (query.length < 2) {
            this.autocompleteResults.innerHTML = '';
            return;
        }

        this.showSearchLoading();

        try {
            const response = await fetch(
                `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${this.apiKey}&limit=5`
            );
            const data = await response.json();
            this.displayAutocompleteResults(data.results);
        } catch (error) {
            console.error('Autocomplete error:', error);
            this.autocompleteResults.innerHTML = '<li class="autocomplete-item">Error fetching results</li>';
        } finally {
            this.hideSearchLoading();
        }
    }

    displayAutocompleteResults(results) {
        this.autocompleteResults.innerHTML = '';
        
        if (!results.length) {
            const li = document.createElement('li');
            li.className = 'autocomplete-item';
            li.textContent = 'No cities found';
            this.autocompleteResults.appendChild(li);
            return;
        }

        results.forEach(result => {
            const li = document.createElement('li');
            li.className = 'autocomplete-item';
            li.textContent = result.formatted;
            li.addEventListener('click', () => {
                this.searchCity(result.formatted, result.geometry);
            });
            this.autocompleteResults.appendChild(li);
        });
    }

    async searchCity(cityName, geometry = null) {
        try {
            this.showLoading('Searching for city...');
            
            if (!geometry) {
                const response = await fetch(
                    `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(cityName)}&key=${this.apiKey}&limit=1`
                );
                const data = await response.json();
                
                if (!data.results.length) {
                    throw new Error('City not found');
                }
                
                geometry = data.results[0].geometry;
            }

            this.closeSearch();
            await this.getWeatherData(geometry.lat, geometry.lng);
        } catch (error) {
            console.error('Search error:', error);
            this.hideLoading();
            this.weatherInfo.textContent = `Error: ${error.message || 'Failed to find city'}`;
        }
    }

    async getCurrentLocation() {
        try {
            this.showLoading('Requesting location access...');
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });
            
            const { latitude, longitude } = position.coords;
            await this.getWeatherData(latitude, longitude);
        } catch (error) {
            console.error('Geolocation error:', error);
            this.hideLoading();
            this.weatherInfo.textContent = 'Unable to get your location. Please ensure location access is enabled in your browser.';
        }
    }

    async getWeatherData(lat, lon) {
        try {
            this.showLoading('Fetching location details...');
            const geoResponse = await fetch(
                `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${this.apiKey}`
            );
            const geoData = await geoResponse.json();
            const cityName = geoData.results[0]?.components.city || 
                           geoData.results[0]?.components.town ||
                           geoData.results[0]?.components.village ||
                           'Unknown location';
            
            this.currentLocation = cityName;

            this.showLoading('Fetching weather forecast...');
            const weatherResponse = await fetch(
                `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${lat}&longitude=${lon}` +
                `&daily=weathercode` +
                `&forecast_days=10` +
                `&timezone=auto`
            );
            const weatherData = await weatherResponse.json();
            
            console.log('Weather Data:', weatherData);
            
            const nextSunnyDay = this.findNextSunnyDay(
                weatherData.daily.time,
                weatherData.daily.weathercode
            );

            this.hideLoading();
            this.updateWeatherDisplay(cityName, nextSunnyDay ? new Date(nextSunnyDay) : null);
            
        } catch (error) {
            console.error('Error:', error);
            this.hideLoading();
            this.weatherInfo.textContent = 'Error fetching weather data';
        }
    }

    findNextSunnyDay(dates, weatherCodes) {
        // Debug log to see what we're working with
        console.log('Weather Code Check:');
        weatherCodes.forEach((code, index) => {
            console.log(`Day ${index + 1}: Code ${code}`);
        });
        
        // Expanded weather codes for "sunny" conditions:
        // 0 = Clear sky
        // 1 = Mainly clear
        // 2 = Partly cloudy
        // 3 = Overcast (debatable, but might still have decent sun)
        const sunnyWeatherCodes = [0, 1, 2];
        
        for (let i = 0; i < dates.length; i++) {
            if (sunnyWeatherCodes.includes(weatherCodes[i])) {
                console.log(`Found sunny day with code ${weatherCodes[i]} on ${dates[i]}`);
                return dates[i];
            }
        }
        return null;
    }

    updateWeatherDisplay(cityName, date) {
        const locationButton = `<span class="location-button" id="location-button">${cityName}</span>`;
        
        if (date) {
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });
            this.weatherInfo.innerHTML = 
                `The next sunny day in ${locationButton}is on ${formattedDate}`;
            document.body.className = 'sunny';
        } else {
            this.weatherInfo.innerHTML = 
                `No sunny days forecast in ${locationButton} for the next 10 days`;
            document.body.className = 'no-sun';
        }

        // Add click handler to the location button
        const locationButtonElement = document.getElementById('location-button');
        if (locationButtonElement) {
            locationButtonElement.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.searchContainer) {
                    this.searchContainer.classList.add('active');
                }
                if (this.citySearchInput) {
                    this.citySearchInput.value = cityName;
                    this.citySearchInput.focus();
                    this.handleSearchInput();
                }
            });
        }
    }

    closeSearch() {
        if (this.searchContainer) {
            this.searchContainer.classList.remove('active');
        }
        if (this.citySearchInput) {
            this.citySearchInput.value = '';
        }
        if (this.autocompleteResults) {
            this.autocompleteResults.innerHTML = '';
        }
        this.hideSearchLoading();
    }
}

new WeatherApp(); 