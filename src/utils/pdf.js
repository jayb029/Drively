/**
 * PDF Generation Utilities for Drively
 * 
 * This module provides utilities for generating PDF reports from driving data.
 * Uses expo-print to create professional-looking PDF documents.
 */

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDateForDisplay } from './time';

/**
 * Generate HTML content for a comprehensive driving report
 * @param {Object} data - The driving data object
 * @param {Array} data.drives - Array of drive records
 * @param {Object} data.user - User data with goals and progress
 * @param {Object} data.streaks - Streak statistics
 * @param {boolean} isOfficial - Whether this is for official/DMV use
 * @param {Object} options - PDF rendering options
 * @param {boolean} options.omitSupervisorSignatures - Keep saved supervisor signatures out of the PDF
 * @returns {string} HTML content for PDF generation
 */
export const generateDrivingReportHTML = (data, isOfficial = false, options = {}) => {
  const { drives, supervisorProfiles = [], user, streaks } = data;
  const { omitSupervisorSignatures = false } = options;
  const totalDayHours = user.completedDayHours;
  const totalNightHours = user.completedNightHours;
  const totalHours = totalDayHours + totalNightHours;
  const normalizeHourGoal = (value, fallback) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
  };
  const goalHours = normalizeHourGoal(user.goalDayHours, 50);
  const goalNightHours = normalizeHourGoal(user.goalNightHours, 10);
  const progressPercent = Math.round((totalHours / Math.max(goalHours, 1)) * 100);
  const currentDate = formatDateForDisplay(new Date().toISOString().split('T')[0]);
  const driverInfo = {
    name: user.driverName || user.fullName || user.name || '',
    dateOfBirth: user.dateOfBirth || user.birthDate || user.dob || '',
    permitNumber: user.permitNumber || user.licenseNumber || '',
  };

  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatRequiredHours = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return '';
    }

    return Number.isInteger(numericValue)
      ? String(numericValue)
      : numericValue.toFixed(1);
  };

  const requiredTotalHours = formatRequiredHours(goalHours);
  const requiredNightHours = formatRequiredHours(goalNightHours);
  const hasMetTotalRequirement = totalHours >= goalHours;
  const hasMetNightRequirement = totalNightHours >= goalNightHours;
  const hasMetOfficialRequirements = hasMetTotalRequirement && hasMetNightRequirement;
  const signatureModeLabel = omitSupervisorSignatures
    ? 'Blank signature version'
    : 'Pre-filled signature version';
  const signatureModeDescription = omitSupervisorSignatures
    ? 'Saved supervisor signatures are intentionally omitted. Use the blank lines below for physical signatures and dates.'
    : 'Saved supervisor signatures are included where available. Date fields remain blank for the signer or reviewing agency.';

  const permitNumberHTML = driverInfo.permitNumber
    ? `
            <div>
              <span class="field-label">Permit/License Number</span>
              <div class="field-value">${escapeHTML(driverInfo.permitNumber)}</div>
            </div>`
    : '';

  const signatureToSVG = (signature) => {
    const paths = Array.isArray(signature?.paths) ? signature.paths : [];
    if (paths.length === 0) {
      return '<div class="signature-empty"></div>';
    }

    const width = Number(signature.width) || 320;
    const height = Number(signature.height) || 160;
    const pathMarkup = paths
      .map((path) => `<path d="${escapeHTML(path)}" stroke="#111827" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
      .join('');

    return `
      <svg class="saved-signature" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${pathMarkup}
      </svg>
    `;
  };

  const supervisorDateOfBirth = (profile) => profile.dateOfBirth || profile.birthDate || profile.dob || '';

  const profileAgreementHTML = supervisorProfiles.length > 0
    ? supervisorProfiles.map((profile) => `
      <div class="profile-signature-row">
        <div class="profile-name-block">
          <div class="profile-name">${escapeHTML(profile.name)}</div>
          <div class="profile-meta">${escapeHTML([profile.relationship, supervisorDateOfBirth(profile) ? `DOB ${supervisorDateOfBirth(profile)}` : null, profile.age ? `${profile.age} years old` : null].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="profile-signature-block">
          ${signatureToSVG(omitSupervisorSignatures ? null : profile.signature)}
          <div class="signature-fields">
            <span class="signature-line-label">${omitSupervisorSignatures ? 'Physical Signature' : 'Saved Signature'}</span>
            <span class="signature-date-field">Date Signed</span>
          </div>
        </div>
      </div>
    `).join('')
    : `
      <div class="profile-signature-row">
        <div class="profile-name-block">
          <div class="profile-name">No saved supervisor profiles</div>
          <div class="profile-meta">Add supervisor profiles and signatures before creating an official export.</div>
        </div>
        <div class="profile-signature-block">
          <div class="signature-empty"></div>
          <div class="signature-fields">
            <span class="signature-line-label">Physical Signature</span>
            <span class="signature-date-field">Date Signed</span>
          </div>
        </div>
      </div>
    `;
  
  let drivesHTML = '';
  drives.forEach((drive, index) => {
    const duration = `${Math.floor(drive.duration / 60)}h ${drive.duration % 60}m`;
    const type = drive.isNightDrive ? 'Night' : 'Day';
    const supervisor = drive.supervisorName || '';
    
    // Generate initials from supervisor name
    const initials = supervisor
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('');
    
    const rowColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';
    
    drivesHTML += `
      <tr style="background-color: ${rowColor};">
        <td class="date-cell">${escapeHTML(formatDateForDisplay(drive.date))}</td>
        <td class="time-cell">${escapeHTML(drive.startTime)}</td>
        <td class="time-cell">${escapeHTML(drive.endTime)}</td>
        <td class="hours-cell">${duration}</td>
        <td class="type-cell">
          <span style="padding: 2px 8px; border-radius: 12px; font-size: 12px; color: white; background-color: ${drive.isNightDrive ? '#1f2937' : '#f59e0b'};">
            ${escapeHTML(type)}
          </span>
        </td>
        <td class="supervisor-cell">
          <div style="border-bottom: 1px solid #d1d5db; min-height: 20px; padding-bottom: 2px;">${escapeHTML(supervisor)}</div>
        </td>
        <td class="initials-cell">
          <div style="border-bottom: 1px solid #d1d5db; min-height: 20px; padding-bottom: 2px; font-weight: 600;">${escapeHTML(initials)}</div>
        </td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Drively - Driving Log Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #374151;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }
          .header p {
            color: #6b7280;
            margin: 5px 0 0 0;
          }
          .report-mode {
            display: inline-block;
            margin-top: 8px;
            padding: 3px 10px;
            border: 1px solid #9ca3af;
            color: #374151;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            background: #ffffff;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          .driver-info {
            margin: -12px 0 24px 0;
            padding: 14px 16px;
            border: 1.5px solid #9ca3af;
            background: #ffffff;
            page-break-inside: avoid;
          }
          .driver-info h2 {
            margin: 0 0 10px 0;
            color: #111827;
            font-size: 14px;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .driver-info-grid {
            display: grid;
            grid-template-columns: ${driverInfo.permitNumber ? '1.4fr 1fr 1fr' : '1.4fr 1fr'};
            gap: 14px;
          }
          .field-label {
            display: block;
            color: #4b5563;
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 5px;
          }
          .field-value {
            min-height: 20px;
            border-bottom: 1.5px solid #111827;
            color: #111827;
            font-size: 13px;
            font-weight: 600;
            padding: 0 2px 2px 2px;
          }
          .summary-card {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #2563eb;
          }
          .summary-card h3 {
            margin: 0 0 15px 0;
            color: #1f2937;
            font-size: 16px;
          }
          .stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .stat-label {
            color: #6b7280;
          }
          .stat-value {
            font-weight: 600;
            color: #374151;
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .required-hours {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid #9ca3af;
          }
          .progress-bar {
            width: 100%;
            height: 20px;
            background: #e5e7eb;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
          }
          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981, #34d399);
            width: ${Math.min(progressPercent, 100)}%;
            transition: width 0.3s ease;
          }
          .drives-section {
            margin-top: 30px;
          }
          .drives-section h2 {
            color: #1f2937;
            margin-bottom: 20px;
            font-size: 20px;
          }
          .drives-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 2px solid #374151;
          }
          .drives-table th {
            background: #f3f4f6;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            border-bottom: 2px solid #374151;
            border-right: 1px solid #374151;
          }
          .drives-table th:last-child {
            border-right: none;
          }
          .drives-table th:nth-child(2),
          .drives-table th:nth-child(3),
          .drives-table th:nth-child(4) {
            text-align: right;
          }
          .drives-table th:nth-child(5),
          .drives-table th:nth-child(7) {
            text-align: center;
          }
          .drives-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #9ca3af;
            border-right: 1px solid #9ca3af;
          }
          .drives-table td:last-child {
            border-right: none;
          }
          .time-cell {
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .hours-cell {
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .type-cell {
            text-align: center;
            white-space: nowrap;
          }
          .supervisor-cell {
            min-width: 120px;
          }
          .initials-cell {
            min-width: 80px;
            text-align: center;
          }
          .footer {
            margin-top: 28px;
            padding-top: 14px;
            border-top: 1px solid #9ca3af;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            line-height: 1.35;
            page-break-inside: avoid;
          }
          .personal-report .footer {
            margin-top: 18px;
            padding-top: 12px;
            color: #4b5563;
            border-top-color: #d1d5db;
          }
          .signature-section {
            margin-top: 40px;
            padding: 20px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            page-break-inside: avoid;
          }
          .signature-section h3 {
            margin: 0 0 15px 0;
            color: #1f2937;
            font-size: 16px;
          }
          .signature-section p {
            margin: 0 0 20px 0;
            color: #6b7280;
            font-size: 14px;
          }
          .profile-agreement {
            margin-top: 30px;
            page-break-inside: avoid;
          }
          .profile-agreement h3 {
            margin: 0 0 10px 0;
            color: #111827;
            font-size: 17px;
          }
          .agreement-text {
            margin: 0 0 16px 0;
            color: #374151;
            font-size: 13px;
            line-height: 1.45;
          }
          .agreement-note {
            margin: 0 0 14px 0;
            color: #4b5563;
            font-size: 12px;
            line-height: 1.4;
            font-weight: 600;
          }
          .signature-mode-note {
            margin: 0 0 12px 0;
            padding: 8px 10px;
            border: 1px solid #d1d5db;
            background: #f9fafb;
            color: #374151;
            font-size: 12px;
            line-height: 1.35;
          }
          .requirement-status {
            margin: 0 0 14px 0;
            padding: 9px 10px;
            border: 1.5px solid ${hasMetOfficialRequirements ? '#059669' : '#b45309'};
            background: ${hasMetOfficialRequirements ? '#ecfdf5' : '#fffbeb'};
            color: ${hasMetOfficialRequirements ? '#065f46' : '#92400e'};
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
          }
          .master-certification {
            margin-top: 22px;
            padding: 16px;
            border: 1.5px solid #9ca3af;
            background: #ffffff;
            page-break-inside: avoid;
          }
          .master-certification h3 {
            margin-bottom: 12px;
          }
          .certification-fill-line {
            display: inline-block;
            width: 86px;
            border-bottom: 1.5px solid #111827;
            min-height: 13px;
            color: #111827;
            font-weight: 700;
            line-height: 1;
            padding: 0 4px 2px 4px;
            text-align: center;
            vertical-align: baseline;
          }
          .master-signature-grid {
            display: grid;
            grid-template-columns: 1fr 140px;
            gap: 22px;
            margin-top: 34px;
            font-size: 11px;
            color: #4b5563;
          }
          .master-signature-line,
          .master-date-line {
            border-top: 1.5px solid #111827;
            padding-top: 5px;
            min-height: 18px;
          }
          .master-date-line {
            text-align: center;
          }
          .signed-location {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            margin: 0 0 16px 0;
            color: #374151;
            font-size: 12px;
          }
          .signed-location-line {
            flex: 1;
            border-bottom: 1px solid #111827;
            height: 18px;
          }
          .signed-location-hint {
            color: #6b7280;
          }
          .profile-signature-row {
            display: flex;
            align-items: stretch;
            gap: 14px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            margin-bottom: 10px;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .profile-name-block {
            flex: 1;
            padding: 12px;
            background: #ffffff;
            border-right: 1px solid #d1d5db;
          }
          .profile-name {
            color: #111827;
            font-weight: 700;
            font-size: 14px;
            margin-bottom: 3px;
          }
          .profile-meta {
            color: #6b7280;
            font-size: 12px;
          }
          .profile-signature-block {
            flex: 1;
            padding: 10px 12px 8px 12px;
            background: #ffffff;
            min-height: 104px;
          }
          .saved-signature {
            width: 100%;
            height: 64px;
            display: block;
          }
          .signature-empty {
            height: 64px;
          }
          .signature-fields {
            display: grid;
            grid-template-columns: 1fr 116px;
            gap: 18px;
            align-items: end;
            margin-top: 8px;
            font-size: 11px;
            color: #4b5563;
          }
          .signature-line-label,
          .signature-date-field {
            border-top: 1px solid #111827;
            padding-top: 4px;
            min-height: 17px;
          }
          .signature-date-field {
            text-align: center;
          }
          .footer-branding {
            font-size: 12px;
            color: #374151;
            font-weight: 700;
            margin: 0 0 3px 0;
          }
          .footer-branding.official {
            font-size: 10px;
            color: #9ca3af;
            margin-bottom: 2px;
          }
          .footer-disclaimer {
            margin: 8px auto 0 auto;
            max-width: 620px;
            color: #4b5563;
            font-size: 11px;
            line-height: 1.4;
          }
          .footer p {
            margin: 3px 0;
          }
          @media print {
            body { 
              padding: 10px 10px 40px 10px;
            }
            .summary-grid { grid-template-columns: 1fr; }
            .driver-info-grid { grid-template-columns: 1fr; }
            .signature-section { page-break-inside: avoid; }
            
            @page:first {
              margin-top: 0;
              margin-bottom: 50px;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 10px;
                margin-right: 10px;
              }
            }
            
            @page {
              margin-top: 50px;
              margin-bottom: 50px;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 10px;
                margin-right: 10px;
              }
            }
          }
        </style>
      </head>
      <body class="${isOfficial ? 'official-report' : 'personal-report'}">
        <div class="header">
          <h1>${isOfficial ? 'Driving Practice Log' : '🛣️ Driving Log Report'}</h1>
          <p>Generated on ${currentDate}</p>
          ${isOfficial ? `<div class="report-mode">${signatureModeLabel}</div>` : ''}
        </div>

        ${isOfficial ? `
        <div class="driver-info">
          <h2>Driver Information</h2>
          <div class="driver-info-grid">
            <div>
              <span class="field-label">Driver Name</span>
              <div class="field-value">${escapeHTML(driverInfo.name)}</div>
            </div>
            <div>
              <span class="field-label">Date of Birth</span>
              <div class="field-value">${escapeHTML(driverInfo.dateOfBirth)}</div>
            </div>
${permitNumberHTML}
          </div>
        </div>
        ` : ''}

        <div class="summary-grid">
          <div class="summary-card">
            <h3>${isOfficial ? 'Progress Summary' : '📊 Progress Summary'}</h3>
            <div class="stat-row">
              <span class="stat-label">License Type:</span>
              <span class="stat-value">${escapeHTML(user.licenseType)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Day Hours:</span>
              <span class="stat-value">${totalDayHours.toFixed(1)} hours</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Night Hours:</span>
              <span class="stat-value">${totalNightHours.toFixed(1)} hours</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Hours:</span>
              <span class="stat-value">${totalHours.toFixed(1)} hours</span>
            </div>
            ${isOfficial ? `
            <div class="required-hours">
              <div class="stat-row">
                <span class="stat-label">Total Required:</span>
                <span class="stat-value">${escapeHTML(requiredTotalHours)} hours</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Night Minimum:</span>
                <span class="stat-value">${escapeHTML(requiredNightHours)} hours</span>
              </div>
            </div>
            ` : ''}
            ${!isOfficial ? `
            <div class="stat-row">
              <span class="stat-label">Goal:</span>
              <span class="stat-value">${escapeHTML(requiredTotalHours)} hours</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <div style="text-align: center; font-weight: 600; color: #059669;">${progressPercent}% Complete</div>
            ` : ''}
          </div>

          ${!isOfficial ? `
          <div class="summary-card">
            <h3>🔥 Streak Statistics</h3>
            <div class="stat-row">
              <span class="stat-label">Current Streak:</span>
              <span class="stat-value">${streaks.current} days</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Longest Streak:</span>
              <span class="stat-value">${streaks.longest} days</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Freeze Days Used:</span>
              <span class="stat-value">${streaks.freezeDaysThisMonth} this month</span>
            </div>
          </div>
          ` : `
          <div class="summary-card">
            <h3>Certification Summary</h3>
            <div class="stat-row">
              <span class="stat-label">Total Drives:</span>
              <span class="stat-value">${drives.length} sessions</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Day Driving:</span>
              <span class="stat-value">${drives.filter(d => !d.isNightDrive).length} sessions</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Night Driving:</span>
              <span class="stat-value">${drives.filter(d => d.isNightDrive).length} sessions</span>
            </div>
          </div>
          `}
        </div>

        <div class="drives-section">
          <h2>${isOfficial ? 'Drive Log' : '📝 Drive Log'} (${drives.length} total drives)</h2>
          <table class="drives-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Type</th>
                  <th>Supervisor</th>
                  <th>Initials</th>
                </tr>
              </thead>
              <tbody>
                ${drivesHTML}
              </tbody>
            </table>
        </div>

        ${isOfficial ? `
        <div class="profile-agreement">
          <h3>Supervisor Agreement</h3>
          <p class="signature-mode-note"><strong>${signatureModeLabel}.</strong> ${signatureModeDescription}</p>
          <p class="requirement-status">
            ${hasMetOfficialRequirements
              ? 'Logged hours meet or exceed the stated total and night driving requirements.'
              : `Logged hours are currently ${escapeHTML(totalHours.toFixed(1))} of ${escapeHTML(requiredTotalHours)} total hours and ${escapeHTML(totalNightHours.toFixed(1))} of ${escapeHTML(requiredNightHours)} night hours. This report documents progress to date and does not certify completion of unmet requirements.`
            }
          </p>
          <p class="agreement-text">
            ${omitSupervisorSignatures
              ? 'I agree and certify under penalty of perjury that the driving practice recorded in this log is accurate to the best of my knowledge, and that I supervised or verified the applicable entries associated with my profile. The signature line below is left blank for physical signature.'
              : 'I agree and certify under penalty of perjury that the driving practice recorded in this log is accurate to the best of my knowledge, that I supervised or verified the applicable entries associated with my profile, and that the signature shown below is my signature for official review.'
            }
          </p>
          <p class="agreement-note">Supervisor must be a licensed driver aged 21 or older, as required by Kansas law.</p>
          <div class="signed-location">
            <span>Signed in:</span>
            <span class="signed-location-line"></span>
            <span class="signed-location-hint">(City, State)</span>
          </div>
          ${profileAgreementHTML}
          <div class="master-certification">
            <h3>Primary Parent/Guardian Certification</h3>
            <p class="agreement-text">
              ${hasMetOfficialRequirements
                ? `I certify that the applicant has completed at least <span class="certification-fill-line">${escapeHTML(requiredTotalHours)}</span> total hours, including at least <span class="certification-fill-line">${escapeHTML(requiredNightHours)}</span> hours of night driving.`
                : `I acknowledge that this log records <span class="certification-fill-line">${escapeHTML(totalHours.toFixed(1))}</span> total hours, including <span class="certification-fill-line">${escapeHTML(totalNightHours.toFixed(1))}</span> hours of night driving, toward requirements of <span class="certification-fill-line">${escapeHTML(requiredTotalHours)}</span> total and <span class="certification-fill-line">${escapeHTML(requiredNightHours)}</span> night hours.`
              }
            </p>
            <div class="master-signature-grid">
              <div class="master-signature-line">Primary Parent/Guardian Signature</div>
              <div class="master-date-line">Date Signed</div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="footer">
          <p class="footer-branding ${isOfficial ? 'official' : ''}">Generated by Drively${isOfficial ? '' : ' - Your personal driving log tracker'}</p>
          <p>This report contains ${drives.length} driving sessions totaling ${totalHours.toFixed(1)} hours</p>
          ${isOfficial ? `
          <p class="footer-disclaimer">
            This log is a personal record of supervised driving practice formatted for Kansas Department of Revenue review.
          </p>
          ` : ''}
        </div>
        </body>
      </html>
    `;
};

/**
 * Generate and save a PDF report to the device
 * @param {Object} data - The driving data object
 * @param {string} filename - Optional custom filename
 * @param {boolean} isOfficial - Whether this is for official/DMV use
 * @param {Object} options - PDF rendering options
 * @returns {Promise<string>} - Promise resolving to the file URI
 */
export const generatePDFReport = async (data, filename, isOfficial = false, options = {}) => {
  try {
    const htmlContent = generateDrivingReportHTML(data, isOfficial, options);
    const signatureSuffix = options.omitSupervisorSignatures ? '_blank_signatures' : '_prefilled_signatures';
    const suffix = isOfficial ? `_official${signatureSuffix}` : '';
    const defaultFilename = `drively_report${suffix}_${new Date().toISOString().split('T')[0]}.pdf`;
    const finalFilename = filename || defaultFilename;
    
    // Generate PDF from HTML
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });
    
    // Ensure the file has proper extension
    const cleanFilename = finalFilename.endsWith('.pdf') ? finalFilename : `${finalFilename}.pdf`;
    
    // Move the file to a more accessible location with better error handling
    const finalUri = `${FileSystem.documentDirectory}${cleanFilename}`;
    
    try {
      await FileSystem.moveAsync({
        from: uri,
        to: finalUri,
      });
    } catch (moveError) {
      console.error('Move error, trying copy instead:', moveError);
      // If move fails, try copy instead
      await FileSystem.copyAsync({
        from: uri,
        to: finalUri,
      });
      // Delete the original temp file
      try {
        await FileSystem.deleteAsync(uri);
      } catch (deleteError) {
        console.warn('Could not delete temp file:', deleteError);
      }
    }
    
    return finalUri;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF report: ${error.message}`);
  }
};

/**
 * Generate a simplified HTML content for quick progress sharing
 * @param {Object} data - The driving data object
 * @returns {string} HTML content for a simple progress report
 */
export const generateProgressSummaryHTML = (data) => {
  const { user, streaks } = data;
  const totalHours = user.completedDayHours + user.completedNightHours;
  const goalHours = user.goalDayHours;
  const progressPercent = Math.round((totalHours / Math.max(goalHours, 1)) * 100);
  const currentDate = formatDateForDisplay(new Date().toISOString().split('T')[0]);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Drively - Progress Summary</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #374151;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }
          .card {
            background: white;
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }
          .progress-ring {
            text-align: center;
            margin: 30px 0;
          }
          .progress-text {
            font-size: 48px;
            font-weight: bold;
            color: #059669;
            margin: 20px 0;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
          }
          .stat-box {
            text-align: center;
            padding: 15px;
            background: #f3f4f6;
            border-radius: 8px;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #374151;
          }
          .stat-label {
            color: #6b7280;
            font-size: 14px;
          }
          
          @media print {
            body { 
              padding: 20px 20px 40px 20px;
            }
            
            @page:first {
              margin-top: 0;
              margin-bottom: 50px;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 10px;
                margin-right: 10px;
              }
            }
            
            @page {
              margin-top: 50px;
              margin-bottom: 50px;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 10px;
                margin-right: 10px;
              }
            }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1>🛣️ My Driving Progress</h1>
            <p>Updated ${currentDate}</p>
          </div>
          
          <div class="progress-ring">
            <div class="progress-text">${progressPercent}%</div>
            <p>of driving goal completed</p>
          </div>
          
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">${totalHours.toFixed(1)}</div>
              <div class="stat-label">Hours Completed</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${goalHours}</div>
              <div class="stat-label">Goal Hours</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${streaks.current}</div>
              <div class="stat-label">Current Streak</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${streaks.longest}</div>
              <div class="stat-label">Best Streak</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};
