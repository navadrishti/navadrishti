/**
 * Utility functions for formatting currency values in INR
 */

/**
 * Format a number as Indian Rupees
 * @param amount - The amount to format
 * @param showDecimals - Whether to show decimal places (default: false for whole numbers)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number | string, showDecimals = false): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '₹0';
  }
  
  // Use Indian number formatting
  const formatted = numAmount.toLocaleString('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  });
  
  return `₹${formatted}`;
}

/**
 * Format currency for display in cards and lists
 * @param amount - The amount to format
 * @returns Formatted currency string without decimals
 */
export function formatPrice(amount: number | string): string {
  return formatCurrency(amount, false);
}

/**
 * Format currency for detailed views with decimals
 * @param amount - The amount to format
 * @returns Formatted currency string with decimals
 */
export function formatDetailedPrice(amount: number | string): string {
  return formatCurrency(amount, true);
}