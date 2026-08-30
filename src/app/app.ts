import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

export interface Expense {
  label: string;
  amount: number;
}

export interface InvestmentPot {
  label: string;
  amount: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
})
export class App {
  // Plan Header & Title
  planTitle: string = 'My FIRE & Coast Plan';

  // Base Timeline Inputs
  currentAge: number = 30;
  retirementAge: number = 40;
  yearsContributing: number = 8;
  retirementDurationYears: number = 30;

  // Contributions & Passive Income
  monthlyContribution: number = 1333;
  passiveMonthlyIncome: number = 1000;
  increaseContributionWithInflation: boolean = false;

  // Rates
  expectedReturnRate: number = 7; // %
  inflationRate: number = 3;      // %

  // Dynamic Array of Investment Pots
  pots: InvestmentPot[] = [
    { label: 'Stocks & Shares ISA', amount: 20000 },
    { label: 'Workplace Pension', amount: 10000 }
  ];

  addPot() {
    this.pots.push({ label: '', amount: 0 });
  }

  removePot(index: number) {
    this.pots.splice(index, 1);
  }

  get startingPot(): number {
    return this.pots.reduce((sum, pot) => sum + (pot.amount || 0), 0);
  }

  // Dynamic Expenses (Monthly Inputs)
  expenses: Expense[] = [
    { label: 'Core Lifestyle Costs', amount: 3500 }
  ];

  addExpense() {
    this.expenses.push({ label: '', amount: 0 });
  }

  removeExpense(index: number) {
    this.expenses.splice(index, 1);
  }

  // --- CALCULATED FIELDS (GETTERS) ---

  get totalMonthlyExpenses(): number {
    return this.expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
  }

  get totalAnnualExpenses(): number {
    return this.totalMonthlyExpenses * 12;
  }

  get requiredMonthlyExpenses(): number {
    return this.totalMonthlyExpenses;
  }

  get netAnnualRetirementExpenses(): number {
    const netMonthly = Math.max(0, this.totalMonthlyExpenses - (this.passiveMonthlyIncome || 0));
    return netMonthly * 12;
  }

  get realReturnRate(): number {
    return this.expectedReturnRate - this.inflationRate;
  }

  get yearsToAccess(): number {
    return Math.max(0, this.retirementAge - this.currentAge);
  }

  get yearsCoasting(): number {
    return Math.max(0, this.yearsToAccess - this.yearsContributing);
  }

  get inflatedAnnualExpensesAtAccess(): number {
    const i = this.inflationRate / 100;
    return this.netAnnualRetirementExpenses * Math.pow(1 + i, this.yearsToAccess);
  }

  get requiredPotAtAccessAge(): number {
    const years = this.retirementDurationYears;
    const annualExpense = this.inflatedAnnualExpensesAtAccess;
    const r = this.realReturnRate / 100;

    if (years <= 0 || annualExpense <= 0) return 0;
    if (r === 0) return annualExpense * years;

    return annualExpense * ((1 - Math.pow(1 + r, -years)) / r);
  }

  get requiredCoastPotAtEndOfContributions(): number {
    const r = this.expectedReturnRate / 100;
    return this.requiredPotAtAccessAge / Math.pow(1 + r, this.yearsCoasting);
  }

  get projectedPotAfterContributionPhase(): number {
    const nominalMonthlyRate = this.expectedReturnRate / 100 / 12;
    const realMonthlyRate = (this.expectedReturnRate - this.inflationRate) / 100 / 12;
    
    const r = this.increaseContributionWithInflation ? nominalMonthlyRate : realMonthlyRate;
    const months = this.yearsContributing * 12;
    
    const startPotFV = this.startingPot * Math.pow(1 + nominalMonthlyRate, months);
    
    let contribFV = 0;
    if (months > 0) {
      if (r > 0) {
        contribFV = this.monthlyContribution * ((Math.pow(1 + r, months) - 1) / r);
      } else {
        contribFV = this.monthlyContribution * months;
      }
    }

    return startPotFV + contribFV;
  }

  get actualProjectedPotAtAccessAge(): number {
    const r = this.expectedReturnRate / 100;
    return this.projectedPotAfterContributionPhase * Math.pow(1 + r, this.yearsCoasting);
  }

  get surplusShortfallAtAccessAge(): number {
    return this.actualProjectedPotAtAccessAge - this.requiredPotAtAccessAge;
  }

  get isCoastReady(): boolean {
    return this.surplusShortfallAtAccessAge >= 0;
  }

  calculateRequiredMonthlyInvestment() {
    const targetAtContributionEnd = this.requiredCoastPotAtEndOfContributions;
    const nominalMonthlyRate = this.expectedReturnRate / 100 / 12;
    const realMonthlyRate = (this.expectedReturnRate - this.inflationRate) / 100 / 12;
    const r = this.increaseContributionWithInflation ? nominalMonthlyRate : realMonthlyRate;
    
    const months = this.yearsContributing * 12;

    const startPotFV = this.startingPot * Math.pow(1 + nominalMonthlyRate, months);
    const neededFromContribs = Math.max(0, targetAtContributionEnd - startPotFV);

    if (months > 0) {
      if (r > 0) {
        const annuityFactor = (Math.pow(1 + r, months) - 1) / r;
        this.monthlyContribution = Math.round(neededFromContribs / annuityFactor);
      } else {
        this.monthlyContribution = Math.round(neededFromContribs / months);
      }
    }
  }

  // --- EXCEL DOWNLOAD / UPLOAD WITH DYNAMIC TITLE FILENAME ---

  downloadExcel() {
    const settingsRows = [
      { Setting: 'Plan Title', Value: this.planTitle },
      { Setting: 'Current Age', Value: this.currentAge },
      { Setting: 'Retirement Access Age', Value: this.retirementAge },
      { Setting: 'Payout Years', Value: this.retirementDurationYears },
      { Setting: 'Years Contributing', Value: this.yearsContributing },
      { Setting: 'Expected Annual Return (%)', Value: this.expectedReturnRate },
      { Setting: 'Expected Inflation Rate (%)', Value: this.inflationRate },
      { Setting: 'Increase Contribution With Inflation', Value: this.increaseContributionWithInflation ? 'Yes' : 'No' },
      { Setting: 'Passive Monthly Income (£)', Value: this.passiveMonthlyIncome },
      { Setting: 'Monthly Investment Contribution (£)', Value: this.monthlyContribution }
    ];

    const potRows = this.pots.map(pot => ({
      Account: pot.label,
      'Balance (£)': pot.amount
    }));

    const expenseRows = this.expenses.map(item => ({
      Description: item.label,
      'Monthly Amount (£)': item.amount,
      'Annual Amount (£)': (item.amount || 0) * 12
    }));

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settingsRows), 'Assumptions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(potRows), 'Pots');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenseRows), 'Expenses');

    // Generate safe filename from title
    const sanitizedTitle = (this.planTitle || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');

    const fileName = sanitizedTitle ? `${sanitizedTitle}.xlsx` : 'FIRE_Calculator_Plan.xlsx';

    XLSX.writeFile(workbook, fileName);
  }

  uploadExcel(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

      // Parse Assumptions & Title
      if (workbook.SheetNames.includes('Assumptions')) {
        const settingsRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Assumptions']);
        settingsRows.forEach(row => {
          const valString = String(row.Value ?? '');
          const valNum = Number(row.Value) || 0;

          switch (row.Setting) {
            case 'Plan Title': this.planTitle = valString; break;
            case 'Current Age': this.currentAge = valNum; break;
            case 'Retirement Access Age': this.retirementAge = valNum; break;
            case 'Payout Years': this.retirementDurationYears = valNum; break;
            case 'Years Contributing': this.yearsContributing = valNum; break;
            case 'Expected Annual Return (%)': this.expectedReturnRate = valNum; break;
            case 'Expected Inflation Rate (%)': this.inflationRate = valNum; break;
            case 'Increase Contribution With Inflation': 
              this.increaseContributionWithInflation = valString.toLowerCase() === 'yes'; 
              break;
            case 'Passive Monthly Income (£)': this.passiveMonthlyIncome = valNum; break;
            case 'Monthly Investment Contribution (£)': this.monthlyContribution = valNum; break;
          }
        });
      }

      // Parse Pots
      if (workbook.SheetNames.includes('Pots')) {
        const potRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Pots']);
        this.pots = potRows.map(row => ({
          label: row.Account || '',
          amount: Number(row['Balance (£)']) || 0
        }));
      }

      // Parse Expenses
      if (workbook.SheetNames.includes('Expenses')) {
        const expenseRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Expenses']);
        this.expenses = expenseRows.map(row => ({
          label: row.Description || '',
          amount: Number(row['Monthly Amount (£)']) || 0
        }));
      }

      target.value = '';
    };

    reader.readAsArrayBuffer(file);
  }
}