const METRICS = {
  difference: {
    label: "Goal Difference",
    defaultDirection: "desc",
  },
  goals: {
    label: "Goals",
    defaultDirection: "desc",
  },
  against: {
    label: "Goals Against",
    defaultDirection: "asc",
  },
};

const MATCHDAY_COLUMNS = ["md1", "md2", "md3"];

const state = {
  metric: "difference",
  selectedMatchdays: new Set([1, 2, 3]),
  sortColumn: "total",
  sortDirection: METRICS.difference.defaultDirection,
};

const elements = {
  statusCopy: document.querySelector("#status-copy"),
  tableWrap: document.querySelector("#table-wrap"),
  metricButtons: Array.from(document.querySelectorAll(".metric-button")),
  matchdayInputs: Array.from(
    document.querySelectorAll(".matchday-toggle input"),
  ),
  matchdayToggles: Array.from(document.querySelectorAll(".matchday-toggle")),
};

let teams = [];

bindEvents();
loadTicker();

async function loadTicker() {
  try {
    const response = await fetch("./ticker.csv");

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const csvText = await response.text();
    teams = parseCsv(csvText).map(toTeamRecord);
    render();
  } catch (error) {
    elements.statusCopy.textContent = "The ticker data could not be loaded.";
    elements.tableWrap.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

function bindEvents() {
  for (const button of elements.metricButtons) {
    button.addEventListener("click", () => {
      const nextMetric = button.dataset.metric;

      if (!METRICS[nextMetric] || nextMetric === state.metric) {
        return;
      }

      state.metric = nextMetric;
      state.sortDirection = METRICS[nextMetric].defaultDirection;
      render();
    });
  }

  for (const input of elements.matchdayInputs) {
    input.addEventListener("change", () => {
      const day = Number(input.dataset.day);

      if (input.checked) {
        state.selectedMatchdays.add(day);
      } else {
        state.selectedMatchdays.delete(day);
      }

      render();
    });
  }

  elements.tableWrap.addEventListener("click", (event) => {
    const button = event.target.closest(".sort-button");

    if (!button) {
      return;
    }

    const nextColumn = button.dataset.column;

    if (state.sortColumn === nextColumn) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortColumn = nextColumn;
      state.sortDirection = METRICS[state.metric].defaultDirection;
    }

    render();
  });
}

function render() {
  if (!teams.length) {
    return;
  }

  updateControls();

  const sortedTeams = [...teams].sort(compareTeams);

  elements.tableWrap.innerHTML = buildTableMarkup(sortedTeams);
}

function updateControls() {
  for (const button of elements.metricButtons) {
    const isActive = button.dataset.metric === state.metric;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  for (const toggle of elements.matchdayToggles) {
    const day = Number(toggle.dataset.day);
    toggle.classList.toggle("is-inactive", !state.selectedMatchdays.has(day));
  }
}

function compareTeams(leftTeam, rightTeam) {
  const leftValue = getColumnValue(leftTeam, state.metric, state.sortColumn);
  const rightValue = getColumnValue(rightTeam, state.metric, state.sortColumn);

  if (leftValue !== rightValue) {
    return state.sortDirection === "asc"
      ? leftValue - rightValue
      : rightValue - leftValue;
  }

  return leftTeam.team.localeCompare(rightTeam.team);
}

function buildTableMarkup(sortedTeams) {
  const columnScales = buildColumnScales(sortedTeams, state.metric);
  const headerMarkup = MATCHDAY_COLUMNS.map((column, index) => {
    const day = index + 1;
    const isInactive = !state.selectedMatchdays.has(day);
    return buildHeaderCell(column, `MD${day}`, isInactive);
  }).join("");

  const rowsMarkup = sortedTeams
    .map((team) => {
      const perDayMarkup = MATCHDAY_COLUMNS.map((column, index) => {
        const day = index + 1;
        const value = getColumnValue(team, state.metric, column);
        const cellClass = state.selectedMatchdays.has(day)
          ? "number-cell"
          : "number-cell is-inactive-day";
        const backgroundColor = getHeatmapColor(
          value,
          columnScales[column],
          state.metric,
        );

        return `<td class="${cellClass}" style="background-color: ${backgroundColor}">${formatNumber(value)}</td>`;
      }).join("");

      const totalValue = getColumnValue(team, state.metric, "total");
      const totalBackgroundColor = getHeatmapColor(
        totalValue,
        columnScales.total,
        state.metric,
      );

      return `
      <tr>
        <td class="team-cell">${escapeHtml(team.team)}</td>
        ${perDayMarkup}
        <td class="number-cell" style="background-color: ${totalBackgroundColor}">${formatNumber(totalValue)}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <table>
      <colgroup>
        <col class="team-column">
        <col class="metric-column">
        <col class="metric-column">
        <col class="metric-column">
        <col class="metric-column">
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Team</th>
          ${headerMarkup}
          ${buildHeaderCell("total", "Total", false)}
        </tr>
      </thead>
      <tbody>
        ${rowsMarkup}
      </tbody>
    </table>
  `;
}

function buildHeaderCell(column, label, isInactive) {
  const isActive = state.sortColumn === column;
  let arrow = "";

  if (isActive) {
    arrow = state.sortDirection === "asc" ? "▲" : "▼";
  }

  const classNames = ["metric-header", isInactive ? "is-inactive-day" : ""]
    .filter(Boolean)
    .join(" ");
  const buttonClasses = ["sort-button", isActive ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");

  return `
    <th scope="col" class="${classNames}">
      <button type="button" class="${buttonClasses}" data-column="${column}">
        <span class="sort-label">${label}</span>
        ${arrow ? `<span class="sort-indicator" aria-hidden="true">${arrow}</span>` : ""}
      </button>
    </th>
  `;
}

function getColumnValue(team, metric, column) {
  const values = team.metrics[metric];

  if (column === "total") {
    let total = 0;

    for (const day of state.selectedMatchdays) {
      total += values[day - 1];
    }

    return total;
  }

  const dayIndex = Number(column.replace("md", "")) - 1;
  return values[dayIndex];
}

function buildColumnScales(teams, metric) {
  const matchdayValues = teams.flatMap((team) =>
    MATCHDAY_COLUMNS.map((column) => getColumnValue(team, metric, column)),
  );
  const totalValues = teams.map((team) =>
    getColumnValue(team, metric, "total"),
  );
  const matchdayScale = {
    min: Math.min(...matchdayValues),
    midpoint: getMedian(matchdayValues),
    max: Math.max(...matchdayValues),
  };

  return {
    md1: matchdayScale,
    md2: matchdayScale,
    md3: matchdayScale,
    total: {
      min: Math.min(...totalValues),
      midpoint: getMedian(totalValues),
      max: Math.max(...totalValues),
    },
  };
}

function getHeatmapColor(value, scale, metric) {
  if (!scale || scale.min === scale.max) {
    return "rgb(255 255 255)";
  }

  if (metric === "against") {
    return getMedianPivotColor(scale.max - value, {
      min: 0,
      midpoint: scale.max - scale.midpoint,
      max: scale.max - scale.min,
    });
  }

  return getMedianPivotColor(value, scale);
}

function getMedianPivotColor(value, scale) {
  if (value <= scale.midpoint) {
    const span = scale.midpoint - scale.min;

    if (span === 0) {
      return "rgb(255 255 255)";
    }

    return mixColors([244, 48, 68], [255, 255, 255], (value - scale.min) / span);
  }

  const span = scale.max - scale.midpoint;

  if (span === 0) {
    return "rgb(255 255 255)";
  }

  return mixColors([255, 255, 255], [38, 191, 68], (value - scale.midpoint) / span);
}

function mixColors(startColor, endColor, weight) {
  const channels = startColor.map((channel, index) => {
    const blended = channel + (endColor[index] - channel) * weight;
    return Math.round(blended);
  });

  return `rgb(${channels.join(" ")})`;
}

function getMedian(values) {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function toTeamRecord(row) {
  const goals = [Number(row.xG1), Number(row.xG2), Number(row.xG3)];
  const against = [Number(row.xA1), Number(row.xA2), Number(row.xA3)];
  const difference = goals.map((value, index) => value - against[index]);

  return {
    team: row.team,
    metrics: {
      difference,
      goals,
      against,
    },
  };
}

function formatNumber(value) {
  return value.toFixed(1);
}

function parseCsv(text) {
  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);

      if (currentRow.some((cell) => cell !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  if (!rows.length) {
    return [];
  }

  const [headerRow, ...bodyRows] = rows;

  return bodyRows.map((row) => {
    const entry = {};

    for (let index = 0; index < headerRow.length; index += 1) {
      entry[headerRow[index]] = row[index] ?? "";
    }

    return entry;
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
