function matchesTripStatusFilter(item, filterStatus) {
  const trip = item || {};
  const normalizedStatus = trip.statusClass || 'recruiting';

  if (!filterStatus) {
    if (trip.isPastTrip === true) return true;
    return ['recruiting', 'almost-full', 'full', 'ongoing'].includes(normalizedStatus);
  }

  if (filterStatus === 'recruiting') {
    return !trip.isPastTrip && ['recruiting', 'almost-full'].includes(normalizedStatus);
  }

  return normalizedStatus === filterStatus;
}

module.exports = { matchesTripStatusFilter };
