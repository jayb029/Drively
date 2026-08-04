/**
 * PDF Generation Utilities for Drively
 * 
 * This module provides utilities for generating PDF reports from driving data.
 * Uses expo-print to create professional-looking PDF documents.
 */

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDateForDisplay } from './time';
import {
  getDriveDayMinutes,
  getDriveNightMinutes,
  getDriveTypeLabel,
  getNightCalculationLabel,
} from './nightDriving';

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

  const formatDriveDuration = (durationMinutes) => {
    const totalMinutes = Math.max(0, Math.round(Number(durationMinutes) || 0));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${minutes} min`;
  };

  const formatSegmentDuration = (durationMinutes) => {
    const numericMinutes = Math.max(0, Number(durationMinutes) || 0);
    return numericMinutes > 0 && numericMinutes < 1
      ? '&lt;1 min'
      : formatDriveDuration(numericMinutes);
  };

  const getSupervisorInitials = (supervisor) => supervisor
    .split(' ')
    .map(name => name.charAt(0).toUpperCase())
    .join('');

  const renderDriveType = (drive) => {
    const dayMinutes = getDriveDayMinutes(drive);
    const nightMinutes = getDriveNightMinutes(drive);
    const showSplit = !isOfficial || (dayMinutes > 0 && nightMinutes > 0);

    return `
      <span class="drive-type ${nightMinutes > 0 ? 'drive-type-night' : 'drive-type-day'}">
        ${escapeHTML(getDriveTypeLabel(drive))}
      </span>
      ${showSplit ? `<div class="drive-time-split">${escapeHTML(`${dayMinutes}m day / ${nightMinutes}m night`)}</div>` : ''}
      <div class="drive-calculation">${escapeHTML(getNightCalculationLabel(drive.nightCalculation))}</div>
    `;
  };

  const requiredTotalHours = formatRequiredHours(goalHours);
  const requiredNightHours = formatRequiredHours(goalNightHours);
  const hasMetTotalRequirement = totalHours >= goalHours;
  const hasMetNightRequirement = totalNightHours >= goalNightHours;
  const hasMetOfficialRequirements = hasMetTotalRequirement && hasMetNightRequirement;
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
      .map((path) => `<path d="${escapeHTML(path)}" stroke="#202521" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
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
  
  const drivesHTML = drives.map((drive) => {
    const supervisor = drive.supervisorName || '';
    const initials = getSupervisorInitials(supervisor);
    const classificationSegments = Array.isArray(drive.classificationSegments)
      ? drive.classificationSegments
      : [];
    const trackingSegments = Array.isArray(drive.segments) ? drive.segments : [];
    const detailSegments = classificationSegments.length > 1
      ? classificationSegments
      : trackingSegments.length > 1 ? trackingSegments : [];
    const detailRows = detailSegments.map((segment, segmentIndex) => {
      const classification = segment.isNightDrive ? 'NIGHT' : 'DAY';
      const trackingLabel = classificationSegments.length > 1 && trackingSegments.length > 1
        ? ` <span class="tracking-segment-label">Segment ${segment.trackingSegmentIndex || 1}</span>`
        : classificationSegments.length > 1 ? '' : ` <span class="tracking-segment-label">Segment ${segmentIndex + 1}</span>`;
      return `
        <tr class="drive-detail-row">
          <td class="segment-label-cell"><strong>${classification}</strong>${trackingLabel}</td>
          <td class="time-cell">${escapeHTML(segment.startTime)}</td>
          <td class="time-cell">${escapeHTML(segment.endTime)}</td>
          <td class="hours-cell">${formatSegmentDuration(segment.durationMinutes)}</td>
          <td class="type-cell"><strong>${classification}</strong></td>
          <td class="segment-supervisor-cell" colspan="2"></td>
        </tr>
      `;
    }).join('');

    return `
      <tr class="drive-parent-row">
        <td class="date-cell">${escapeHTML(formatDateForDisplay(drive.date))}</td>
        <td class="time-cell">${escapeHTML(drive.startTime)}</td>
        <td class="time-cell">${escapeHTML(drive.endTime)}</td>
        <td class="hours-cell">${escapeHTML(formatDriveDuration(drive.duration))}</td>
        <td class="type-cell">${renderDriveType(drive)}</td>
        <td class="supervisor-cell">
          <div style="border-bottom: 1px solid #c4c9c0; min-height: 20px; padding-bottom: 2px;">${escapeHTML(supervisor)}</div>
        </td>
        <td class="initials-cell">
          <div style="border-bottom: 1px solid #c4c9c0; min-height: 20px; padding-bottom: 2px; font-weight: 600;">${escapeHTML(initials)}</div>
        </td>
      </tr>
      ${detailRows}
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Drively - Driving Log Report</title>
        <style>
          :root {
            --ink: #202521;
            --muted: #5f675f;
            --rule: #c4c9c0;
            --paper-tint: #f7f7f3;
            --green: #355e4c;
            --green-dark: #274638;
            --amber: #995718;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Avenir Next', 'Helvetica Neue', sans-serif;
            line-height: 1.4;
            color: var(--ink);
            max-width: 790px;
            margin: 0 auto;
            padding: 26px 28px 34px;
            background: #ffffff;
            font-size: 11px;
          }
          .header {
            margin-bottom: 22px;
            border-top: 7px solid var(--green);
            border-bottom: 1px solid var(--ink);
            padding: 14px 0 13px;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 24px;
          }
          .brand {
            color: var(--green-dark);
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.4px;
            margin-bottom: 3px;
          }
          .header h1 {
            color: var(--ink);
            margin: 0;
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 25px;
            line-height: 1.08;
            font-weight: 700;
            letter-spacing: -0.25px;
          }
          .report-meta {
            flex: 0 0 190px;
            color: var(--muted);
            font-size: 10px;
            line-height: 1.45;
            text-align: right;
          }
          .report-meta strong {
            display: block;
            color: var(--ink);
            font-size: 11px;
            font-weight: 700;
          }
          .report-mode {
            display: block;
            margin-top: 2px;
            color: var(--muted);
          }
          .summary-grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 12px;
            margin-bottom: 24px;
          }
          .driver-info {
            margin: 0 0 14px;
            padding: 12px 14px 14px;
            border: 1px solid var(--ink);
            background: #ffffff;
            page-break-inside: avoid;
          }
          .driver-info h2 {
            margin: 0 0 10px 0;
            color: var(--ink);
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 13px;
          }
          .driver-info-grid {
            display: grid;
            grid-template-columns: ${driverInfo.permitNumber ? '1.4fr 1fr 1fr' : '1.4fr 1fr'};
            gap: 14px;
          }
          .field-label {
            display: block;
            color: var(--muted);
            font-size: 9px;
            font-weight: 700;
            margin-bottom: 5px;
          }
          .field-value {
            min-height: 20px;
            border-bottom: 1px solid var(--ink);
            color: var(--ink);
            font-size: 11px;
            font-weight: 600;
            padding: 0 2px 2px 2px;
          }
          .summary-card {
            background: #ffffff;
            padding: 13px 14px;
            border: 1px solid var(--rule);
            border-top: 3px solid var(--green);
            page-break-inside: avoid;
          }
          .summary-card h3 {
            margin: 0 0 10px;
            color: var(--ink);
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 14px;
          }
          .official-summary {
            display: grid;
            grid-template-columns: 1.15fr repeat(5, 1fr);
            margin-bottom: 20px;
            border-top: 1px solid var(--ink);
            border-bottom: 1px solid var(--ink);
            page-break-inside: avoid;
          }
          .official-summary-item {
            padding: 9px 10px 10px;
            border-right: 1px solid var(--rule);
          }
          .official-summary-item:last-child {
            border-right: none;
          }
          .official-summary-label {
            display: block;
            margin-bottom: 3px;
            color: var(--muted);
            font-size: 8px;
          }
          .official-summary-value {
            display: block;
            color: var(--ink);
            font-size: 11px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
          }
          .stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            gap: 16px;
          }
          .stat-label {
            color: var(--muted);
          }
          .stat-value {
            font-weight: 600;
            color: var(--ink);
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .required-hours {
            margin-top: 9px;
            padding-top: 8px;
            border-top: 1px solid var(--rule);
          }
          .progress-bar {
            width: 100%;
            height: 7px;
            background: #d8dbd3;
            overflow: hidden;
            margin: 10px 0 6px;
          }
          .progress-fill {
            height: 100%;
            background: var(--green);
            width: ${Math.min(progressPercent, 100)}%;
          }
          .drives-section {
            margin-top: 18px;
          }
          .drives-section h2 {
            color: var(--ink);
            margin: 0;
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 17px;
          }
          .section-heading {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 16px;
            margin-bottom: 7px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--ink);
          }
          .section-heading span {
            color: var(--muted);
            font-size: 10px;
            white-space: nowrap;
          }
          .table-note {
            margin: 0 0 8px;
            color: var(--muted);
            font-size: 9px;
          }
          .drives-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            background: #ffffff;
            border: 1px solid var(--ink);
            table-layout: fixed;
            font-size: 9px;
          }
          .drives-table th {
            background: #eff0ea;
            padding: 7px 5px;
            text-align: left;
            font-weight: 600;
            color: var(--ink);
            border-bottom: 1px solid var(--ink);
            border-right: 1px solid var(--rule);
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
            padding: 7px 5px;
            border-bottom: 1px solid var(--rule);
            border-right: 1px solid var(--rule);
            vertical-align: top;
            overflow-wrap: anywhere;
          }
          .official-report .drives-table td {
            padding: 5px 4px;
          }
          .official-report .drive-detail-row td {
            padding-top: 4px;
            padding-bottom: 4px;
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
          .drives-table th:nth-child(1) { width: 14%; }
          .drives-table th:nth-child(2),
          .drives-table th:nth-child(3) { width: 11%; }
          .drives-table th:nth-child(4) { width: 11%; }
          .drives-table th:nth-child(5) { width: 17%; }
          .drives-table th:nth-child(6) { width: 25%; }
          .drives-table th:nth-child(7) { width: 11%; }
          .drive-type {
            display: inline-block;
            padding: 2px 7px;
            border: 1px solid #6b7280;
            font-size: 9px;
            font-weight: 700;
            line-height: 1.2;
          }
          .drive-type-night {
            color: #ffffff;
            background: var(--green-dark);
            border-color: var(--green-dark);
          }
          .drive-type-day {
            color: #6f3d13;
            background: #f4eadc;
            border-color: #c97826;
          }
          .drive-time-split {
            margin-top: 2px;
            color: var(--muted);
            font-size: 9px;
          }
          .drive-calculation {
            color: #70786f;
            font-size: 8px;
          }
          .official-report .drive-calculation {
            display: none;
          }
          .official-report .drive-type {
            padding: 0;
            border: none;
            background: transparent;
            color: var(--ink);
          }
          .supervisor-cell {
            min-width: 0;
          }
          .initials-cell {
            min-width: 0;
            text-align: center;
          }
          .drive-parent-row td {
            background: #ffffff;
            color: var(--ink);
            font-weight: 700;
          }
          .supervisor-line,
          .initials-line {
            min-height: 20px;
            padding-bottom: 2px;
            border-bottom: 1px solid #6b7280;
          }
          .initials-line {
            font-weight: 700;
          }
          .drive-detail-row td {
            padding-top: 5px;
            padding-bottom: 5px;
            background: #e5e7e1;
            color: var(--muted);
            font-size: 8px;
          }
          .segment-label-cell {
            padding-left: 18px !important;
            color: var(--ink) !important;
            white-space: nowrap;
          }
          .tracking-segment-label {
            display: block;
            margin-top: 2px;
            color: var(--muted);
            font-size: 8px;
            font-weight: 400;
          }
          .segment-supervisor-cell {
            background: #e5e7e1 !important;
          }
          .footer {
            margin-top: 22px;
            padding-top: 9px;
            border-top: 1px solid var(--rule);
            text-align: left;
            color: var(--muted);
            font-size: 9px;
            line-height: 1.35;
            page-break-inside: avoid;
          }
          .personal-report .footer {
            margin-top: 18px;
            padding-top: 12px;
            color: var(--muted);
            border-top-color: var(--rule);
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
            margin-top: 24px;
            page-break-before: always;
            border-top: 7px solid var(--green);
            padding-top: 14px;
          }
          .profile-agreement h3 {
            margin: 0 0 10px 0;
            color: var(--ink);
            font-family: 'Avenir Next Condensed', 'Helvetica Neue', sans-serif;
            font-size: 17px;
          }
          .agreement-text {
            margin: 0 0 16px 0;
            color: var(--ink);
            font-size: 13px;
            line-height: 1.45;
          }
          .agreement-note {
            margin: 0 0 14px 0;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.4;
            font-weight: 600;
          }
          .signature-mode-note {
            margin: 0 0 12px 0;
            padding: 8px 10px;
            border: 1px solid var(--rule);
            background: var(--paper-tint);
            color: var(--ink);
            font-size: 12px;
            line-height: 1.35;
          }
          .requirement-status {
            margin: 0 0 14px 0;
            padding: 9px 10px;
            border: 1px solid ${hasMetOfficialRequirements ? '#477a5f' : '#c97826'};
            border-left-width: 4px;
            background: ${hasMetOfficialRequirements ? '#eef4f0' : '#fbf3e8'};
            color: ${hasMetOfficialRequirements ? '#274638' : '#6f3d13'};
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
          }
          .master-certification {
            margin-top: 22px;
            padding: 16px;
            border: 1px solid var(--ink);
            background: #ffffff;
            page-break-inside: avoid;
          }
          .master-certification h3 {
            margin-bottom: 12px;
          }
          .certification-fill-line {
            display: inline-block;
            width: 86px;
            border-bottom: 1px solid var(--ink);
            min-height: 13px;
            color: var(--ink);
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
            color: var(--muted);
          }
          .master-signature-line,
          .master-date-line {
            border-top: 1px solid var(--ink);
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
            color: var(--ink);
            font-size: 12px;
          }
          .signed-location-line {
            flex: 1;
            border-bottom: 1px solid var(--ink);
            height: 18px;
          }
          .signed-location-hint {
            color: var(--muted);
          }
          .profile-signature-row {
            display: flex;
            align-items: stretch;
            gap: 14px;
            border: 1px solid var(--rule);
            margin-bottom: 10px;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .profile-name-block {
            flex: 1;
            padding: 12px;
            background: #ffffff;
            border-right: 1px solid var(--rule);
          }
          .profile-name {
            color: var(--ink);
            font-weight: 700;
            font-size: 14px;
            margin-bottom: 3px;
          }
          .profile-meta {
            color: var(--muted);
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
            color: var(--muted);
          }
          .signature-line-label,
          .signature-date-field {
            border-top: 1px solid var(--ink);
            padding-top: 4px;
            min-height: 17px;
          }
          .signature-date-field {
            text-align: center;
          }
          .footer-branding {
            font-size: 10px;
            color: var(--ink);
            font-weight: 700;
            margin: 0 0 3px 0;
          }
          .footer-branding.official {
            font-size: 10px;
            color: var(--muted);
            margin-bottom: 2px;
          }
          .footer-disclaimer {
            margin: 8px auto 0 auto;
            max-width: 620px;
            color: var(--muted);
            font-size: 11px;
            line-height: 1.4;
          }
          .footer p {
            margin: 3px 0;
          }
          @media print {
            @page {
              size: Letter;
              margin: 0.46in 0.42in 0.5in;
              @bottom-left {
                content: "Drively driving record";
                color: #70786f;
                font-family: 'Avenir Next', 'Helvetica Neue', sans-serif;
                font-size: 7px;
              }
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
                color: #70786f;
                font-family: 'Avenir Next', 'Helvetica Neue', sans-serif;
                font-size: 7px;
              }
            }
            body { max-width: none; padding: 0; }
            thead { display: table-header-group; }
            tr, .summary-card, .driver-info, .profile-signature-row,
            .master-certification { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body class="${isOfficial ? 'official-report' : 'personal-report'}">
        <div class="header">
          <div class="header-top">
            <div>
              <div class="brand">DRIVELY</div>
              <h1>${isOfficial ? 'Supervised driving practice log' : 'Driving progress report'}</h1>
            </div>
            <div class="report-meta">
              <strong>Prepared ${currentDate}</strong>
              ${isOfficial ? '<span class="report-mode">Kansas review copy</span>' : '<span>Personal logbook summary</span>'}
            </div>
          </div>
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

        ${isOfficial ? `
        <div class="official-summary">
          <div class="official-summary-item">
            <span class="official-summary-label">License type</span>
            <span class="official-summary-value">${escapeHTML(user.licenseType)}</span>
          </div>
          <div class="official-summary-item">
            <span class="official-summary-label">Total hours</span>
            <span class="official-summary-value">${totalHours.toFixed(1)}</span>
          </div>
          <div class="official-summary-item">
            <span class="official-summary-label">Day hours</span>
            <span class="official-summary-value">${totalDayHours.toFixed(1)}</span>
          </div>
          <div class="official-summary-item">
            <span class="official-summary-label">Night hours</span>
            <span class="official-summary-value">${totalNightHours.toFixed(1)}</span>
          </div>
          <div class="official-summary-item">
            <span class="official-summary-label">Required</span>
            <span class="official-summary-value">${escapeHTML(requiredTotalHours)} total</span>
          </div>
          <div class="official-summary-item">
            <span class="official-summary-label">Night minimum</span>
            <span class="official-summary-value">${escapeHTML(requiredNightHours)} hours</span>
          </div>
        </div>
        ` : `
        <div class="summary-grid">
          <div class="summary-card">
            <h3>Progress toward your goal</h3>
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
            <div class="stat-row">
              <span class="stat-label">Goal:</span>
              <span class="stat-value">${escapeHTML(requiredTotalHours)} hours</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <div style="text-align: right; font-weight: 700; color: #274638;">${progressPercent}% complete</div>
          </div>

          <div class="summary-card">
            <h3>Practice consistency</h3>
            <div class="stat-row">
              <span class="stat-label">Current Streak:</span>
              <span class="stat-value">${escapeHTML(streaks.current)} days</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Longest Streak:</span>
              <span class="stat-value">${escapeHTML(streaks.longest)} days</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Freeze Days Used:</span>
              <span class="stat-value">${escapeHTML(streaks.freezeDaysThisMonth)} this month</span>
            </div>
          </div>
        </div>
        `}

        ${drives.length > 0 ? `
        <div class="drives-section">
          <div class="section-heading">
            <h2>Drive log</h2>
            <span>${drives.length} ${drives.length === 1 ? 'recorded session' : 'recorded sessions'}</span>
          </div>
          ${!isOfficial ? '<p class="table-note">Saved drives appear in bold. Day/night or pause segments are listed beneath the related drive and are not counted twice.</p>' : ''}
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
        ` : ''}

        ${isOfficial ? `
          <div class="profile-agreement">
            <h3>Supervisor Agreement</h3>
          ${!omitSupervisorSignatures ? '<p class="signature-mode-note"><strong>Saved signatures included.</strong> Date fields remain available for the signer or reviewing agency.</p>' : ''}
          <p class="requirement-status">
            ${hasMetOfficialRequirements
              ? 'Logged hours meet or exceed the stated total and night driving requirements.'
              : `Logged hours are currently ${escapeHTML(totalHours.toFixed(1))} of ${escapeHTML(requiredTotalHours)} total hours and ${escapeHTML(totalNightHours.toFixed(1))} of ${escapeHTML(requiredNightHours)} night hours. This report documents progress to date and does not certify completion of unmet requirements.`
            }
          </p>
          <p class="agreement-text">
            ${omitSupervisorSignatures
              ? 'I agree and certify under penalty of perjury that the driving practice recorded in this log is accurate to the best of my knowledge, and that I supervised or verified the applicable entries associated with my profile.'
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
          <p class="footer-branding ${isOfficial ? 'official' : ''}">Drively driving record</p>
          <p>${drives.length} driving sessions · ${totalHours.toFixed(1)} total hours · prepared ${currentDate}</p>
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
              <div class="stat-value">${escapeHTML(streaks.current)}</div>
              <div class="stat-label">Current Streak</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${escapeHTML(streaks.longest)}</div>
              <div class="stat-label">Best Streak</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};
