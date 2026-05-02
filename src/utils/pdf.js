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
 * @returns {string} HTML content for PDF generation
 */
export const generateDrivingReportHTML = (data, isOfficial = false) => {
  const { drives, supervisorProfiles = [], user, streaks } = data;
  const totalDayHours = user.completedDayHours;
  const totalNightHours = user.completedNightHours;
  const totalHours = totalDayHours + totalNightHours;
  const goalHours = user.goalDayHours + user.goalNightHours;
  const progressPercent = Math.round((totalHours / goalHours) * 100);
  const currentDate = formatDateForDisplay(new Date().toISOString().split('T')[0]);

  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

  const profileAgreementHTML = supervisorProfiles.length > 0
    ? supervisorProfiles.map((profile) => `
      <div class="profile-signature-row">
        <div class="profile-name-block">
          <div class="profile-name">${escapeHTML(profile.name)}</div>
          <div class="profile-meta">${escapeHTML([profile.relationship, profile.age ? `${profile.age} years old` : null].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="profile-signature-block">
          ${signatureToSVG(profile.signature)}
          <div class="signature-label">Signature</div>
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
          <div class="signature-label">Signature</div>
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
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">${escapeHTML(formatDateForDisplay(drive.date))}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">${escapeHTML(drive.startTime)}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">${duration}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
          <span style="padding: 2px 8px; border-radius: 12px; font-size: 12px; color: white; background-color: ${drive.isNightDrive ? '#1f2937' : '#f59e0b'};">
            ${escapeHTML(type)}
          </span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; min-width: 120px;">
          <div style="border-bottom: 1px solid #d1d5db; min-height: 20px; padding-bottom: 2px;">${escapeHTML(supervisor)}</div>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; min-width: 80px;">
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
          .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
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
          .drives-table td {
            border-right: 1px solid #e5e7eb;
          }
          .drives-table td:last-child {
            border-right: none;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
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
            margin-top: 40px;
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
          .profile-signature-row {
            display: flex;
            align-items: stretch;
            gap: 14px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            margin-bottom: 12px;
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
            padding: 8px 12px 6px 12px;
            background: #ffffff;
            min-height: 82px;
          }
          .saved-signature {
            width: 100%;
            height: 62px;
            display: block;
          }
          .signature-empty {
            height: 62px;
            border-bottom: 1px solid #111827;
          }
          .signature-label {
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
          @media print {
            body { 
              padding: 10px 10px 40px 10px;
            }
            .summary-grid { grid-template-columns: 1fr; }
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
      <body>
        <div class="header">
          <h1>${isOfficial ? 'Official Driving Log Report' : '🛣️ Driving Log Report'}</h1>
          <p>Generated on ${currentDate}</p>
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <h3>${isOfficial ? 'Progress Summary' : '📊 Progress Summary'}</h3>
            <div class="stat-row">
              <span class="stat-label">License Type:</span>
              <span class="stat-value">${user.licenseType}</span>
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
            ${!isOfficial ? `
            <div class="stat-row">
              <span class="stat-label">Goal:</span>
              <span class="stat-value">${goalHours} hours</span>
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
          <h2>${isOfficial ? 'Drive Log' : '📝 Drive Log'} (${drives.length} total drives)</h2>            <table class="drives-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
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
          <p class="agreement-text">
            I agree and certify under penalty of perjury that the driving practice recorded in this log is accurate to the best of my knowledge, that I supervised or verified the applicable entries associated with my profile, and that the signature shown below is my signature for official review.
          </p>
          ${profileAgreementHTML}
        </div>
        ` : ''}

        <div class="footer">
          <p>Generated by Drively - Your personal driving log tracker</p>
          <p>This report contains ${drives.length} driving sessions totaling ${totalHours.toFixed(1)} hours</p>
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
 * @returns {Promise<string>} - Promise resolving to the file URI
 */
export const generatePDFReport = async (data, filename, isOfficial = false) => {
  try {
    const htmlContent = generateDrivingReportHTML(data, isOfficial);
    const suffix = isOfficial ? '_official' : '';
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
  const goalHours = user.goalDayHours + user.goalNightHours;
  const progressPercent = Math.round((totalHours / goalHours) * 100);
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
