"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      {title && (
        <div className="border-b border-border bg-neutral-800 px-4 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-neutral-900 p-4">
        <code className="text-sm leading-relaxed text-neutral-200">
          {children}
        </code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-sm text-neutral-200">
      {children}
    </code>
  );
}

export default function MonetizationGuidePage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/developer/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Monetization</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Monetization</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Earn revenue from your Arinova Apps through in-app purchases using
          Arinova Coins, the platform&apos;s virtual currency.
        </p>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav className="space-y-1.5">
          {[
            ["Overview", "#overview"],
            ["Revenue Model", "#revenue-model"],
            ["Setting Up Products", "#setting-up-products"],
            ["Purchase Flow", "#purchase-flow"],
            ["Earnings Dashboard", "#earnings-dashboard"],
            ["Refund Policy", "#refund-policy"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* Overview */}
      <section className="mb-12" id="overview">
        <h2 className="mb-4 text-2xl font-bold">Overview</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Arinova Chat uses a virtual currency called{" "}
            <strong className="text-foreground">Arinova Coins</strong> for all
            in-app transactions. Users purchase coins through the platform, and
            spend them inside apps. As a developer, you earn coins when users
            make purchases in your app.
          </p>
          <p>
            This model gives you a simple, consistent way to monetize without
            dealing with payment processors, currency conversion, or compliance.
            The platform handles all payment infrastructure -- you just
            register products and call the purchase API.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-3xl font-bold text-yellow-400">Coins</p>
              <p className="mt-1 text-sm">Virtual currency</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-3xl font-bold text-green-400">70%</p>
              <p className="mt-1 text-sm">Developer share</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">30%</p>
              <p className="mt-1 text-sm">Platform fee</p>
            </div>
          </div>
        </div>
      </section>

      {/* Revenue Model */}
      <section className="mb-12" id="revenue-model">
        <h2 className="mb-4 text-2xl font-bold">Revenue Model</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Arinova uses a <strong className="text-foreground">70/30 revenue split</strong>.
            For every purchase made in your app, you receive 70% of the coins
            spent, and Arinova retains 30% as a platform fee.
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Example
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground">
                    Coins
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">User buys &quot;3 Extra Lives&quot;</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    50 coins
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-green-400">
                    Developer earns (70%)
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-400">
                    35 coins
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Platform fee (30%)</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    15 coins
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Monetization models
          </h3>
          <p>
            Choose one of four models in your manifest&apos;s{" "}
            <InlineCode>monetization.model</InlineCode> field:
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Model
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>free</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Completely free to use. No in-app purchases.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>paid</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Users pay upfront to access the app.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>freemium</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Free to use with optional in-app purchases for premium
                    features or virtual goods.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <InlineCode>subscription</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Recurring payments for ongoing access or premium features.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            If your app sells virtual goods (items, upgrades, cosmetics), set{" "}
            <InlineCode>monetization.virtualGoods</InlineCode> to{" "}
            <InlineCode>true</InlineCode>. External payment systems are not
            permitted -- set <InlineCode>monetization.externalPayments</InlineCode>{" "}
            to <InlineCode>false</InlineCode>.
          </p>
        </div>
      </section>

      {/* Setting Up Products */}
      <section className="mb-12" id="setting-up-products">
        <h2 className="mb-4 text-2xl font-bold">Setting Up Products</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Products are defined in two places: declared in your manifest for
            marketplace listing, and registered at runtime via the SDK for
            purchase functionality.
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Step 1: Manifest configuration
          </h3>
          <p>
            Set the monetization model in your manifest.json:
          </p>
          <CodeBlock title="manifest.json (excerpt)">{`{
  "monetization": {
    "model": "freemium",
    "virtualGoods": true,
    "externalPayments": false
  }
}`}</CodeBlock>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Step 2: Register products with the SDK
          </h3>
          <p>
            Call <InlineCode>app.registerProducts()</InlineCode> when your app
            initializes to declare purchasable items for the current session.
            Each product has an ID, display name, price in coins, and an
            optional icon.
          </p>
          <CodeBlock title="app.js">{`import { ArinovaApp } from '@arinova/app-sdk';

const app = new ArinovaApp();

// Register products at startup
app.registerProducts([
  {
    id: 'extra_lives_3',
    name: '3 Extra Lives',
    price: 50,
    icon: 'assets/heart.png',
  },
  {
    id: 'extra_lives_10',
    name: '10 Extra Lives',
    price: 150,
    icon: 'assets/heart.png',
  },
  {
    id: 'premium_skin_gold',
    name: 'Gold Skin',
    price: 200,
    icon: 'assets/gold-skin.png',
  },
  {
    id: 'remove_ads',
    name: 'Remove Ads',
    price: 500,
  },
]);`}</CodeBlock>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm">
              <strong className="text-blue-400">Product IDs:</strong> Use
              descriptive, stable IDs for your products. These IDs appear in
              purchase receipts and transaction records. Do not change them
              between versions unless you want to create a new product.
            </p>
          </div>
        </div>
      </section>

      {/* Purchase Flow */}
      <section className="mb-12" id="purchase-flow">
        <h2 className="mb-4 text-2xl font-bold">Purchase Flow</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            When a user wants to buy something in your app, you call{" "}
            <InlineCode>app.requestPurchase(productId)</InlineCode>. Here is
            what happens behind the scenes:
          </p>

          {/* Flow diagram */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="space-y-0 divide-y divide-border">
              <div className="flex gap-4 px-4 py-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  1
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    App calls requestPurchase()
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your app sends a purchase request to the platform with the
                    product ID.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 px-4 py-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  2
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Platform shows confirmation dialog
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The user sees a native confirmation dialog with the product
                    name, price, and their current coin balance.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 px-4 py-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  3
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    User confirms or cancels
                  </p>
                  <p className="text-sm text-muted-foreground">
                    If confirmed, coins are deducted from the user&apos;s balance.
                    If cancelled, the promise rejects.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 px-4 py-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                  4
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Receipt returned
                  </p>
                  <p className="text-sm text-muted-foreground">
                    On success, the promise resolves with a{" "}
                    <InlineCode>PurchaseReceipt</InlineCode> containing the
                    receipt ID, product ID, and timestamp. Your app grants the
                    purchased item.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Implementation
          </h3>
          <CodeBlock title="Purchase button handler">{`const buyButton = document.getElementById('buy-lives');

buyButton.addEventListener('click', async () => {
  buyButton.disabled = true;
  buyButton.textContent = 'Processing...';

  try {
    const receipt = await app.requestPurchase('extra_lives_3');

    // Purchase successful — grant the item
    addLives(3);
    showNotification('You got 3 extra lives!');

    // Log the receipt for your records
    console.log('Receipt ID:', receipt.receiptId);
    console.log('Product:', receipt.productId);
    console.log('Time:', new Date(receipt.timestamp));

  } catch (err) {
    // Purchase was cancelled or failed
    if (err.message === 'Purchase failed') {
      showNotification('Purchase failed. Please try again.');
    } else {
      // User cancelled — no action needed
      console.log('Purchase cancelled by user');
    }
  } finally {
    buyButton.disabled = false;
    buyButton.textContent = 'Buy 3 Lives (50 coins)';
  }
});`}</CodeBlock>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            PurchaseReceipt object
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Field
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>receiptId</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>string</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Unique identifier for this transaction
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>productId</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>string</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    The purchased product&apos;s ID
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <InlineCode>timestamp</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>number</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Unix timestamp (milliseconds) of the purchase
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Earnings Dashboard */}
      <section className="mb-12" id="earnings-dashboard">
        <h2 className="mb-4 text-2xl font-bold">Earnings Dashboard</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Track your earnings in the{" "}
            <Link
              href="/developer"
              className="text-blue-400 hover:underline"
            >
              Developer Dashboard
            </Link>
            . The earnings section shows:
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="space-y-0 divide-y divide-border">
              <div className="px-4 py-3">
                <p className="font-medium text-foreground">Total Earnings</p>
                <p className="text-sm text-muted-foreground">
                  Lifetime total coins earned across all your apps, after the
                  70/30 split.
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="font-medium text-foreground">
                  Recent Transactions
                </p>
                <p className="text-sm text-muted-foreground">
                  A chronological list of individual earning transactions,
                  showing the amount, description, and date.
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="font-medium text-foreground">Per-App Breakdown</p>
                <p className="text-sm text-muted-foreground">
                  Earnings grouped by app, so you can see which apps are
                  performing best.
                </p>
              </div>
            </div>
          </div>

          <p>
            You can also check your total coin balance in the{" "}
            <Link
              href="/wallet"
              className="text-blue-400 hover:underline"
            >
              Wallet
            </Link>
            , which shows your current coin balance across all sources
            (earnings, top-ups, refunds).
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Payouts
          </h3>
          <p>
            Developer payouts convert earned Arinova Coins to real currency.
            To receive payouts, make sure your{" "}
            <strong className="text-foreground">Payout Information</strong> is
            configured in your developer profile. You can set this during
            registration or update it later in the Developer Dashboard.
          </p>
        </div>
      </section>

      {/* Refund Policy */}
      <section className="mb-12" id="refund-policy">
        <h2 className="mb-4 text-2xl font-bold">Refund Policy</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Arinova supports refunds under the following conditions:
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Policy
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Refund window
                  </td>
                  <td className="px-4 py-3">
                    Users can request a refund within{" "}
                    <strong className="text-foreground">24 hours</strong> of
                    purchase.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Eligibility
                  </td>
                  <td className="px-4 py-3">
                    Only{" "}
                    <strong className="text-foreground">unused goods</strong>{" "}
                    are eligible for refund. If the user has consumed or
                    activated the purchased item, the refund may be denied.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Impact on earnings
                  </td>
                  <td className="px-4 py-3">
                    When a refund is issued, the corresponding earning
                    transaction is reversed. The coins are returned to the
                    user&apos;s balance and deducted from your developer
                    earnings.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">
                    Abuse prevention
                  </td>
                  <td className="px-4 py-3">
                    Repeated refund abuse may result in account restrictions for
                    the user.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-sm">
              <strong className="text-yellow-400">Design for refunds:</strong>{" "}
              When possible, design your app so that purchased items can be
              tracked as &quot;used&quot; or &quot;unused.&quot; This helps the
              platform determine refund eligibility and protects your revenue
              from unwarranted refunds.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/developer/docs/submission"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Submission Guide
        </Link>
        <Link
          href="/developer/docs"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Documentation Index &rarr;
        </Link>
      </div>
    </div>
  );
}
