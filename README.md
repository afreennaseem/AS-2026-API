# AS-2026-API — E-commerce Checkout API

## What is this API?

A small e-commerce REST API for checkout, built with **Node.js** and **Express** for the AS Workshop. It has four endpoints:

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/register` | POST | No | Register a new user |
| `/api/login` | POST | No | Log in and get a JWT token |
| `/api/cart` | GET / POST | Bearer token | View your cart / add a product to your cart |
| `/api/checkout` | POST | Bearer token | Pay for the cart with `cash` or `credit_card` |

All data is kept in an **in-memory database** (plain JavaScript variables in [src/database.js](src/database.js)). Everything is reset to the seed data each time the server restarts.

The API specification is written in Swagger/OpenAPI ([docs/swagger.yaml](docs/swagger.yaml)) and is served by the app.

## How to install

Requirements: [Node.js](https://nodejs.org/) 18 or newer, and npm.

```bash
git clone https://github.com/afreennaseem/AS-2026-API.git
cd AS-2026-API
npm install
```

## How to run

```bash
npm start
```

The server starts on `http://localhost:3000`. To use another port:

```bash
PORT=4000 npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

## Test data

### Users

| ID | Name | Email | Password |
|---|---|---|---|
| 1 | Alice Johnson | alice@example.com | alice123 |
| 2 | Bob Smith | bob@example.com | bob123 |
| 3 | Carol White | carol@example.com | carol123 |

### Products

| ID | Name | Price | Stock |
|---|---|---|---|
| 1 | Wireless Mouse | 25.00 | 50 |
| 2 | Mechanical Keyboard | 80.00 | 30 |
| 3 | USB-C Monitor | 200.00 | 10 |

## Business rules

1. **Cash payment gets a 10% discount** on the cart subtotal.
2. **Credit card payment gets no discount.**
3. `paymentMethod` must be exactly `cash` or `credit_card`; anything else returns `400`.
4. Cart and checkout require a valid token from `/api/login` (sent as `Authorization: Bearer <token>`). Tokens expire after 1 hour.
5. Each user has their own cart. Adding a product that is already in the cart increases its quantity.
6. You cannot add more of a product than is in stock, and you cannot check out an empty cart.
7. A successful checkout creates an order, reduces product stock, and empties the cart.
8. Email addresses must be unique when registering.

**Example:** a cart with 1 Mechanical Keyboard (80.00) and 2 Wireless Mice (50.00) has a subtotal of 130.00.
- Paid with `cash` → discount 13.00 → total **117.00**
- Paid with `credit_card` → discount 0.00 → total **130.00**

## Example requests

```bash
# Log in
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"alice123"}'

# Add a product to the cart (replace <TOKEN> with the token from login)
curl -X POST http://localhost:3000/api/cart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"productId":1,"quantity":2}'

# View the cart
curl http://localhost:3000/api/cart -H "Authorization: Bearer <TOKEN>"

# Check out with cash
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"paymentMethod":"cash"}'
```

## Important URLs

With the server running locally on the default port:

| URL | What it is |
|---|---|
| http://localhost:3000/api-docs | Swagger UI — interactive API documentation (use **Authorize** to paste your token) |
| http://localhost:3000/swagger.yaml | Raw Swagger/OpenAPI YAML file |
| http://localhost:3000/api/register | Register endpoint |
| http://localhost:3000/api/login | Login endpoint |
| http://localhost:3000/api/cart | Cart endpoint |
| http://localhost:3000/api/checkout | Checkout endpoint |

## Automated tests

API tests use **Mocha**, **SuperTest** and **Chai**, with **mochawesome** HTML reports. They cover the checkout discount rule using equivalence partitioning (EP1–EP7).

```bash
cp .env.example .env   # base URL, test-user passwords, START_SERVER flag
npm test               # report: reports/mochawesome/checkout-api-report.html
```

Requires Node.js 20.19+ (Mocha 12). With `START_SERVER=true` the run starts the API in-process on the `BASE_URL` port, so every run uses fresh seed data. With `false`, tests target an already-running API — restart it between runs, since checkout consumes stock.

```
test/
├── checkout/        # specs for the checkout module
├── data/            # data-driven inputs (users, products, checkout cases)
├── helpers/         # config (dotenv), api (SuperTest), login, cart, checkout, pricing, evidence
└── setup/hooks.js   # global server start/stop + evidence attached to the report
```

### Continuous integration

[.github/workflows/api-tests.yml](.github/workflows/api-tests.yml) runs the suite on GitHub Actions for every push to a branch with a pull request targeting `main`, and for pushes to `main`. It starts the API with `npm start`, waits until it responds, and runs `npm test` with `START_SERVER=false`. The mochawesome report is uploaded as the `mochawesome-report` build artifact.

Required repository secrets (Settings → Secrets and variables → Actions): `ALICE_PASSWORD`, `BOB_PASSWORD`, `CAROL_PASSWORD`. `JWT_SECRET` is optional.

## Project structure

```
├── docs/swagger.yaml        # API specification
├── src/
│   ├── app.js               # Express app, routes and Swagger UI
│   ├── server.js            # Starts the HTTP server
│   ├── database.js          # In-memory data (users, products, carts, orders)
│   ├── middleware/auth.js   # JWT authentication
│   └── routes/
│       ├── auth.js          # /register and /login
│       ├── cart.js          # /cart
│       └── checkout.js      # /checkout (payment discount rule)
└── package.json
```
