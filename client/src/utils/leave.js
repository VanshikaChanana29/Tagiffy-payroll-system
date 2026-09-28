// Earned leave is stored as 'Paid'; people know it as Earned leave. Sick is
// discontinued but still appears on past requests. 'WFH' is a Work From Home
// request that goes through the same approval flow.
export const leaveTypeLabel = (leaveType) =>
  leaveType === 'Paid' ? 'Earned' : leaveType === 'WFH' ? 'Work From Home' : leaveType;

// Full display name of a request: "Earned Leave", "Unpaid Leave", "Work From Home".
export const leaveTitle = (leaveType) =>
  leaveType === 'WFH' ? 'Work From Home' : `${leaveTypeLabel(leaveType)} Leave`;
