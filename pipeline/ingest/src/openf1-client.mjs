const OPENF1_BASE_URL = "https://api.openf1.org/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openF1Fetch(endpoint, params = {}) {
  const url = new URL(`${OPENF1_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 && attempt < 4) {
      await sleep(12000 + attempt * 3000);
      continue;
    }

    throw new Error(`OpenF1 request failed: ${response.status} ${response.statusText}`);
  }

  throw new Error("OpenF1 request failed after retries.");
}

export async function fetchSessionMetadata({ year, countryName, sessionName }) {
  return openF1Fetch("sessions", {
    year,
    country_name: countryName,
    session_name: sessionName,
  });
}

export async function fetchSessions({ year, meetingKey, sessionName } = {}) {
  return openF1Fetch("sessions", {
    year,
    meeting_key: meetingKey,
    session_name: sessionName,
  });
}

export async function fetchMeetings({ year } = {}) {
  return openF1Fetch("meetings", {
    year,
  });
}

export async function fetchDrivers({ sessionKey }) {
  return openF1Fetch("drivers", {
    session_key: sessionKey,
  });
}

export async function fetchLaps({ sessionKey, driverNumber }) {
  return openF1Fetch("laps", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

export async function fetchCarData({ sessionKey, driverNumber }) {
  return openF1Fetch("car_data", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

export async function fetchSessionResult({ sessionKey }) {
  return openF1Fetch("session_result", {
    session_key: sessionKey,
  });
}

export async function fetchStints({ sessionKey }) {
  return openF1Fetch("stints", {
    session_key: sessionKey,
  });
}

export async function fetchWeather({ sessionKey }) {
  return openF1Fetch("weather", {
    session_key: sessionKey,
  });
}
