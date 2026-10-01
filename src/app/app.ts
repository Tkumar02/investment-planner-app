import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';


export interface InvestmentPot {
  label: string;
  amount: number;
  expectedReturnRate: number; // Individual return rate per pot (%)
  monthlyContribution: number; // Individual monthly contribution per pot (£)
  accessAge: number;
  isTaxable: boolean;
  payoutYears: number;
  yearsContributing: number;
  monthlyExpenditure: number;
  passiveIncome: number;
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

  // Contributions & Passive Income
  increaseContributionWithInflation: boolean = false;

  // Global Rates
  inflationRate: number = 3; // %
  taxRate: number = 20; // Default tax rate for taxable pots (%)
  retirementReturnRate: number = 5; // % Return rate during retirement payout phase

  // Active Estimate Storage for Preview Box
  activeEstimate: EstimateResult | null = null;

  // Dynamic Array of Investment Pots
  pots: InvestmentPot[] = [
    { label: 'Stocks & Shares ISA', amount: 20000, expectedReturnRate: 7, monthlyContribution: 800, isTaxable: false, accessAge: 50, payoutYears: 15, yearsContributing: 8, monthlyExpenditure: 3500, passiveIncome: 0 },
    { label: 'Cash Savings', amount: 5000, expectedReturnRate: 4, monthlyContribution: 100, isTaxable: false, accessAge: 40, payoutYears: 10, yearsContributing: 5, monthlyExpenditure: 0, passiveIncome: 0 },
    { label: 'Workplace Pension', amount: 10000, expectedReturnRate: 7, monthlyContribution: 433, isTaxable: true, accessAge: 60, payoutYears: 30, yearsContributing: 10, monthlyExpenditure: 0, passiveIncome: 1000 }
  ];

  addPot() {
    this.pots.push({ label: '', amount: 0, expectedReturnRate: 5, monthlyContribution: 0, isTaxable: false, accessAge: 55, payoutYears: 30, yearsContributing: 10, monthlyExpenditure: 0, passiveIncome: 0 });
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



  // --- CALCULATED FIELDS (GETTERS) ---


  get yearsToFirstAccess(): number {
    if (this.pots.length === 0) return 0;
    const firstAccess = Math.min(...this.pots.map(p => p.accessAge));
    return Math.max(0, firstAccess - this.currentAge);
  }

  get yearsCoasting(): number {
    if (this.pots.length === 0) return 0;
    const maxContrib = Math.max(...this.pots.map(p => p.yearsContributing));
    return Math.max(0, this.yearsToFirstAccess - maxContrib);
  }

  get pvRequiredPotAtFirstAccess(): number {
    const cashflow = this.retirementCashflowProjection;
    if (cashflow.length === 0) return 0;
    
    const rReal = this.realRetirementReturnRate / 100;
    let totalPV = 0;
    
    cashflow.forEach((row, index) => {
      if (rReal === 0) {
        totalPV += row.requiredIncome;
      } else {
        totalPV += row.requiredIncome / Math.pow(1 + rReal, index);
      }
    });
    
    return totalPV;
  }

  get pvProjectedPotAtFirstAccess(): number {
    const cashflow = this.retirementCashflowProjection;
    if (cashflow.length === 0) return 0;
    
    const rReal = this.realRetirementReturnRate / 100;
    let totalPV = 0;
    
    cashflow.forEach((row, index) => {
      if (rReal === 0) {
        totalPV += row.totalIncome;
      } else {
        totalPV += row.totalIncome / Math.pow(1 + rReal, index);
      }
    });
    
    return totalPV;
  }


  get potSuccessAnalysis(): { potLabel: string, isSuccessful: boolean, maxShortfall: number, years: string }[] {
    const cashflow = this.retirementCashflowProjection;
    if (cashflow.length === 0) return [];
    
    return this.pots.map(pot => {
      const activeYears = cashflow.filter(row => row.age >= pot.accessAge && row.age < (pot.accessAge + pot.payoutYears));
      const isSuccessful = activeYears.length > 0 && !activeYears.some(row => row.shortfall > 0);
      const maxShortfall = activeYears.length > 0 ? Math.max(...activeYears.map(row => row.shortfall)) : 0;
      
      return {
        potLabel: pot.label || 'Unnamed Pot',
        isSuccessful,
        maxShortfall,
        years: `Ages ${pot.accessAge} to ${pot.accessAge + pot.payoutYears}`
      };
    });
  }

  get pvSurplusShortfall(): number {
    return this.pvProjectedPotAtFirstAccess - this.pvRequiredPotAtFirstAccess;
  }

  get realRetirementReturnRate(): number {
    return this.retirementReturnRate - this.inflationRate;
  }





  get isCoastReady(): boolean {
    const cashflow = this.retirementCashflowProjection;
    if (cashflow.length === 0) return false;
    return !cashflow.some((row: any) => row.shortfall > 0);
  }

  get retirementCashflowProjection(): any[] {
    if (this.pots.length === 0) return [];

    const startAge = Math.min(...this.pots.map(p => p.accessAge));
    let endAge = startAge;

    this.pots.forEach(pot => {
      if (pot.accessAge + pot.payoutYears > endAge) {
        endAge = pot.accessAge + pot.payoutYears;
      }
    });

    const projection = [];
    for (let age = startAge; age < endAge; age++) {
      const yearFromCurrent = Math.max(0, age - this.currentAge);
      
      let totalExpenditureToday = 0;
      let totalPassiveToday = 0;
      let totalIncome = 0;
      let incomeBreakdown: any = {};

      this.pots.forEach(pot => {
        if (age >= pot.accessAge && age < pot.accessAge + pot.payoutYears) {
          totalExpenditureToday += (pot.monthlyExpenditure || 0) * 12;
          totalPassiveToday += (pot.passiveIncome || 0) * 12;
          const totalYearsGrowth = Math.max(0, pot.accessAge - this.currentAge);
          const coastingYears = Math.max(0, pot.accessAge - this.currentAge - pot.yearsContributing);
          const potRate = (pot.expectedReturnRate || 0) / 100;
          
          let startingVal = (pot.amount || 0) * Math.pow(1 + potRate, totalYearsGrowth);
          
          let contribValueAtEnd = 0;
          const months = pot.yearsContributing * 12;
          if (months > 0) {
            const nominalMonthlyRate = (pot.expectedReturnRate || 0) / 100 / 12;
            const realMonthlyRate = ((pot.expectedReturnRate || 0) - this.inflationRate) / 100 / 12;
            const r = this.increaseContributionWithInflation ? nominalMonthlyRate : realMonthlyRate;
            const contrib = pot.monthlyContribution || 0;
            if (r > 0) {
              contribValueAtEnd = contrib * ((Math.pow(1 + r, months) - 1) / r);
            } else {
              contribValueAtEnd = contrib * months;
            }
          }
          let contribVal = contribValueAtEnd * Math.pow(1 + potRate, coastingYears);
          
          let finalVal = startingVal + contribVal;
          if (pot.isTaxable) {
             finalVal = finalVal * (1 - (this.taxRate / 100));
          }

          const rReal = this.realRetirementReturnRate / 100;
          let initialWithdrawal = 0;
          if (rReal === 0) {
            initialWithdrawal = finalVal / pot.payoutYears;
          } else {
            initialWithdrawal = finalVal / ((1 - Math.pow(1 + rReal, -pot.payoutYears)) / rReal);
          }
          
          const yearsSinceAccess = age - pot.accessAge;
          const currentWithdrawal = initialWithdrawal * Math.pow(1 + this.inflationRate / 100, yearsSinceAccess);
          
          totalIncome += currentWithdrawal;
          incomeBreakdown[pot.label] = currentWithdrawal;
        }
      });

      const netAnnualToday = Math.max(0, totalExpenditureToday - totalPassiveToday);
      const requiredIncome = netAnnualToday * Math.pow(1 + this.inflationRate / 100, yearFromCurrent);
      projection.push({
        age,
        requiredIncome,
        totalIncome,
        shortfall: Math.max(0, requiredIncome - totalIncome),
        surplus: Math.max(0, totalIncome - requiredIncome),
        incomeBreakdown
      });
    }
    return projection;
  }


  // --- ESTIMATOR ACTIONS ---

  estimateMonthlyContribution() {
    let low = 0;
    let high = 50000;
    let best = 0;

    const originalContributions = this.pots.map(p => p.monthlyContribution);
    const totalOriginal = this.totalMonthlyContribution;
    
    for (let i = 0; i < 50; i++) {
      const mid = Math.round((low + high) / 2);
      
      if (totalOriginal > 0) {
        this.pots.forEach((p, idx) => {
          p.monthlyContribution = Math.round((originalContributions[idx] / totalOriginal) * mid);
        });
      } else {
        const share = Math.round(mid / this.pots.length);
        this.pots.forEach(p => p.monthlyContribution = share);
      }
      
      if (this.isCoastReady) {
        best = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    
    this.pots.forEach((p, idx) => p.monthlyContribution = originalContributions[idx]);

    this.activeEstimate = {
      type: 'contribution',
      value: best,
      label: 'Estimated Required Monthly Contribution (Total Across Pots)',
      unit: '£'
    };
  }

  estimateCoastingYears() {
    let requiredAdditionalYears = 0;
    let found = false;
    
    const originalAccessAges = this.pots.map(p => p.accessAge);
    
    for (let i = 0; i <= 60; i++) {
      this.pots.forEach((p, idx) => p.accessAge = originalAccessAges[idx] + i);
      
      if (this.isCoastReady) {
        requiredAdditionalYears = i;
        found = true;
        break;
      }
    }
    
    this.pots.forEach((p, idx) => p.accessAge = originalAccessAges[idx]);

    if (found) {
      this.activeEstimate = {
        type: 'coasting',
        value: requiredAdditionalYears,
        label: 'Additional Years to Delay Access (Across all pots)',
        unit: 'years'
      };
    } else {
      this.activeEstimate = {
        type: 'coasting',
        value: 0,
        label: 'Could not resolve additional years (Max limit)',
        unit: 'years'
      };
    }
  }

  applyEstimate() {
    if (!this.activeEstimate) return;

    if (this.activeEstimate.type === 'contribution') {
      const newTotal = this.activeEstimate.value;
      const oldTotal = this.totalMonthlyContribution;

      if (oldTotal > 0) {
        this.pots.forEach(pot => {
          pot.monthlyContribution = Math.round((pot.monthlyContribution / oldTotal) * newTotal);
        });
      } else if (this.pots.length > 0) {
        const share = Math.round(newTotal / this.pots.length);
        this.pots.forEach(pot => pot.monthlyContribution = share);
      }
    } else if (this.activeEstimate.type === 'coasting') {
      const additionalYears = this.activeEstimate.value;
      this.pots.forEach(pot => pot.accessAge += additionalYears);

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
      { Setting: 'Retirement Return Rate (%)', Value: this.retirementReturnRate },
      { Setting: 'Expected Inflation Rate (%)', Value: this.inflationRate },
      { Setting: 'Tax Rate on Withdrawals (%)', Value: this.taxRate },
      { Setting: 'Increase Contribution With Inflation', Value: this.increaseContributionWithInflation ? 'Yes' : 'No' },
      { Setting: 'Passive Monthly Income (£)', Value: 0 } // Deprecated
    ];

    const potRows = this.pots.map(pot => ({
      Account: pot.label,
      'Balance (£)': pot.amount,
      'Expected Return (%)': pot.expectedReturnRate,
      'Monthly Contribution (£)': pot.monthlyContribution,
      'Access Age': pot.accessAge || '',
      'Is Taxable?': pot.isTaxable ? 'Yes' : 'No',
      'Payout Years': pot.payoutYears || '',
      'Years Contributing': pot.yearsContributing || 0,
      'Monthly Expenditure (£)': pot.monthlyExpenditure || 0,
      'Passive Income (£)': pot.passiveIncome || 0
    }));

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settingsRows), 'Assumptions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(potRows), 'Pots');

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
            case 'Retirement Return Rate (%)': this.retirementReturnRate = valNum; break;
            case 'Expected Inflation Rate (%)': this.inflationRate = valNum; break;
            case 'Tax Rate on Withdrawals (%)': this.taxRate = valNum; break;
            case 'Increase Contribution With Inflation': 
              this.increaseContributionWithInflation = valString.toLowerCase() === 'yes'; 
              break;
          }
        });
      }

      if (workbook.SheetNames.includes('Pots')) {
        const potRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Pots']);
        this.pots = potRows.map(row => ({
          label: row.Account || '',
          amount: Number(row['Balance (£)']) || 0,
          expectedReturnRate: Number(row['Expected Return (%)']) ?? 5,
          monthlyContribution: Number(row['Monthly Contribution (£)']) || 0,
          accessAge: Number(row['Access Age']) || 55,
          isTaxable: String(row['Is Taxable?']).toLowerCase() === 'yes',
          payoutYears: Number(row['Payout Years']) || 30,
          yearsContributing: Number(row['Years Contributing']) || 0,
          monthlyExpenditure: Number(row['Monthly Expenditure (£)']) || 0,
          passiveIncome: Number(row['Passive Income (£)']) || 0
        }));
      }


      target.value = '';
    };

    reader.readAsArrayBuffer(file);
  }
}