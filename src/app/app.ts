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
  expectedReturnRate: number; // Individual return rate per pot (%)
  monthlyContribution: number; // Individual monthly contribution per pot (£)
}

export interface EstimateResult {
  type: 'contribution' | 'coasting';
  value: number;
  label: string;
  unit: string;
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
  retirementDurationYears: number = 30; // Payout duration in years

  // Contributions & Passive Income
  passiveMonthlyIncome: number = 1000;
  increaseContributionWithInflation: boolean = false;

  // Global Rates
  inflationRate: number = 3; // %
  retirementReturnRate: number = 5; // % Return rate during retirement payout phase

  // Active Estimate Storage for Preview Box
  activeEstimate: EstimateResult | null = null;

  // Dynamic Array of Investment Pots
  pots: InvestmentPot[] = [
    { label: 'Stocks & Shares ISA', amount: 20000, expectedReturnRate: 7, monthlyContribution: 800 },
    { label: 'Cash Savings', amount: 5000, expectedReturnRate: 4, monthlyContribution: 100 },
    { label: 'Workplace Pension', amount: 10000, expectedReturnRate: 7, monthlyContribution: 433 }
  ];

  addPot() {
    this.pots.push({ label: '', amount: 0, expectedReturnRate: 5, monthlyContribution: 0 });
  }

  removePot(index: number) {
    this.pots.splice(index, 1);
  }

  get startingPot(): number {
    return this.pots.reduce((sum, pot) => sum + (pot.amount || 0), 0);
  }

  get totalMonthlyContribution(): number {
    return this.pots.reduce((sum, pot) => sum + (pot.monthlyContribution || 0), 0);
  }

  // Weighted Average Return Rate across ongoing monthly contributions
  get averageContributionReturnRate(): number {
    const totalContrib = this.totalMonthlyContribution;
    if (totalContrib <= 0) {
      if (this.pots.length === 0) return 0;
      const rateSum = this.pots.reduce((sum, pot) => sum + (pot.expectedReturnRate || 0), 0);
      return rateSum / this.pots.length;
    }
    const weightedSum = this.pots.reduce((sum, pot) => {
      return sum + (pot.monthlyContribution || 0) * (pot.expectedReturnRate || 0);
    }, 0);
    return weightedSum / totalContrib;
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

  get realRetirementReturnRate(): number {
    return this.retirementReturnRate - this.inflationRate;
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

  // Payout Years Present Value Model
  get requiredPotAtAccessAge(): number {
    const years = this.retirementDurationYears;
    const annualExpense = this.inflatedAnnualExpensesAtAccess;
    const r = this.realRetirementReturnRate / 100;

    if (years <= 0 || annualExpense <= 0) return 0;
    if (r === 0) return annualExpense * years;

    return annualExpense * ((1 - Math.pow(1 + r, -years)) / r);
  }

  // Required Coast Pot target at the end of contribution phase
  get requiredCoastPotAtEndOfContributions(): number {
    const coastingRate = this.averageContributionReturnRate / 100;
    if (this.yearsCoasting <= 0) {
      return this.requiredPotAtAccessAge;
    }
    return this.requiredPotAtAccessAge / Math.pow(1 + coastingRate, this.yearsCoasting);
  }

  // Calculates starting balances growth for all pots during contribution phase
  get startingPotsValueAfterContributionPhase(): number {
    const years = this.yearsContributing;
    return this.pots.reduce((sum, pot) => {
      const potRate = (pot.expectedReturnRate || 0) / 100;
      return sum + (pot.amount || 0) * Math.pow(1 + potRate, years);
    }, 0);
  }

  // Calculates future value of per-pot monthly contributions individually
  get newContributionsValueAfterContributionPhase(): number {
    const months = this.yearsContributing * 12;
    if (months <= 0) return 0;

    return this.pots.reduce((sum, pot) => {
      const nominalMonthlyRate = (pot.expectedReturnRate || 0) / 100 / 12;
      const realMonthlyRate = ((pot.expectedReturnRate || 0) - this.inflationRate) / 100 / 12;
      const r = this.increaseContributionWithInflation ? nominalMonthlyRate : realMonthlyRate;
      const contrib = pot.monthlyContribution || 0;

      if (r > 0) {
        return sum + contrib * ((Math.pow(1 + r, months) - 1) / r);
      }
      return sum + contrib * months;
    }, 0);
  }

  get projectedPotAfterContributionPhase(): number {
    return this.startingPotsValueAfterContributionPhase + this.newContributionsValueAfterContributionPhase;
  }

  // Value of starting pots grown all the way to retirement access age
  get startingPotsValueAtAccessAge(): number {
    const totalYears = this.yearsToAccess;
    return this.pots.reduce((sum, pot) => {
      const potRate = (pot.expectedReturnRate || 0) / 100;
      return sum + (pot.amount || 0) * Math.pow(1 + potRate, totalYears);
    }, 0);
  }

  // Value of contributions grown through the coasting phase
  get newContributionsValueAtAccessAge(): number {
    const coastingRate = this.averageContributionReturnRate / 100;
    return this.newContributionsValueAfterContributionPhase * Math.pow(1 + coastingRate, this.yearsCoasting);
  }

  get actualProjectedPotAtAccessAge(): number {
    return this.startingPotsValueAtAccessAge + this.newContributionsValueAtAccessAge;
  }

  get surplusShortfallAtAccessAge(): number {
    return this.actualProjectedPotAtAccessAge - this.requiredPotAtAccessAge;
  }

  get isCoastReady(): boolean {
    return this.surplusShortfallAtAccessAge >= 0;
  }

  // --- ESTIMATOR ACTIONS ---

  estimateMonthlyContribution() {
    const totalTargetAtAccess = this.requiredPotAtAccessAge;
    const startingPotsGrowthAtAccess = this.startingPotsValueAtAccessAge;
    const neededFromContribsAtAccess = Math.max(0, totalTargetAtAccess - startingPotsGrowthAtAccess);

    const avgRate = this.averageContributionReturnRate;
    const coastingRate = avgRate / 100;
    const neededFromContribsAtContribEnd = neededFromContribsAtAccess / Math.pow(1 + coastingRate, this.yearsCoasting);

    const nominalMonthlyRate = avgRate / 100 / 12;
    const realMonthlyRate = (avgRate - this.inflationRate) / 100 / 12;
    const r = this.increaseContributionWithInflation ? nominalMonthlyRate : realMonthlyRate;
    const months = this.yearsContributing * 12;

    let calculatedContrib = 0;
    if (months > 0) {
      if (r > 0) {
        const annuityFactor = (Math.pow(1 + r, months) - 1) / r;
        calculatedContrib = Math.round(neededFromContribsAtContribEnd / annuityFactor);
      } else {
        calculatedContrib = Math.round(neededFromContribsAtContribEnd / months);
      }
    }

    this.activeEstimate = {
      type: 'contribution',
      value: calculatedContrib,
      label: 'Estimated Required Monthly Contribution (Total Across Pots)',
      unit: '£'
    };
  }

  estimateCoastingYears() {
    const builtPot = this.projectedPotAfterContributionPhase;
    const targetPot = this.requiredPotAtAccessAge;
    const r = this.averageContributionReturnRate / 100;

    let requiredYears = 0;
    if (builtPot > 0 && targetPot > builtPot && r > 0) {
      requiredYears = Math.log(targetPot / builtPot) / Math.log(1 + r);
    }

    this.activeEstimate = {
      type: 'coasting',
      value: Math.max(0, Number(requiredYears.toFixed(1))),
      label: 'Estimated Required Coasting Years',
      unit: 'years'
    };
  }

  applyEstimate() {
    if (!this.activeEstimate) return;

    if (this.activeEstimate.type === 'contribution') {
      const newTotal = this.activeEstimate.value;
      const oldTotal = this.totalMonthlyContribution;

      if (oldTotal > 0) {
        // Distribute proportionally across existing pot contributions
        this.pots.forEach(pot => {
          pot.monthlyContribution = Math.round((pot.monthlyContribution / oldTotal) * newTotal);
        });
      } else if (this.pots.length > 0) {
        // Divide equally if current contributions are 0
        const share = Math.round(newTotal / this.pots.length);
        this.pots.forEach(pot => pot.monthlyContribution = share);
      }
    } else if (this.activeEstimate.type === 'coasting') {
      this.retirementAge = this.currentAge + this.yearsContributing + this.activeEstimate.value;
    }

    this.activeEstimate = null;
  }

  dismissEstimate() {
    this.activeEstimate = null;
  }

  // --- EXCEL DOWNLOAD / UPLOAD ---

  downloadExcel() {
    const settingsRows = [
      { Setting: 'Plan Title', Value: this.planTitle },
      { Setting: 'Current Age', Value: this.currentAge },
      { Setting: 'Retirement Access Age', Value: this.retirementAge },
      { Setting: 'Payout Years', Value: this.retirementDurationYears },
      { Setting: 'Years Contributing', Value: this.yearsContributing },
      { Setting: 'Retirement Return Rate (%)', Value: this.retirementReturnRate },
      { Setting: 'Expected Inflation Rate (%)', Value: this.inflationRate },
      { Setting: 'Increase Contribution With Inflation', Value: this.increaseContributionWithInflation ? 'Yes' : 'No' },
      { Setting: 'Passive Monthly Income (£)', Value: this.passiveMonthlyIncome }
    ];

    const potRows = this.pots.map(pot => ({
      Account: pot.label,
      'Balance (£)': pot.amount,
      'Expected Return (%)': pot.expectedReturnRate,
      'Monthly Contribution (£)': pot.monthlyContribution
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
            case 'Retirement Return Rate (%)': this.retirementReturnRate = valNum; break;
            case 'Expected Inflation Rate (%)': this.inflationRate = valNum; break;
            case 'Increase Contribution With Inflation': 
              this.increaseContributionWithInflation = valString.toLowerCase() === 'yes'; 
              break;
            case 'Passive Monthly Income (£)': this.passiveMonthlyIncome = valNum; break;
          }
        });
      }

      if (workbook.SheetNames.includes('Pots')) {
        const potRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Pots']);
        this.pots = potRows.map(row => ({
          label: row.Account || '',
          amount: Number(row['Balance (£)']) || 0,
          expectedReturnRate: Number(row['Expected Return (%)']) ?? 5,
          monthlyContribution: Number(row['Monthly Contribution (£)']) || 0
        }));
      }

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