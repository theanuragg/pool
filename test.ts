import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Liquidity Pool", function () {
  let spaceCoinICO: any;
  let liquidityPool: any;
  let spaceRouter: any;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;
  let liquidity: BigNumber;

  beforeEach(async function () {
    [owner, treasury, alice, bob, charlie, dan] = await ethers.getSigners();

    const SpaceCoinICO = await ethers.getContractFactory("SpaceCoinICO");
    spaceCoinICO = await SpaceCoinICO.connect(owner).deploy(treasury.address, [owner.address, treasury.address, alice.address, bob.address, charlie.address, dan.address]);
    await spaceCoinICO.deployed();
    console.log("ICO contract address: ", spaceCoinICO.address);

    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    liquidityPool = await LiquidityPool.connect(owner).deploy(spaceCoinICO.address);
    await liquidityPool.deployed();
    console.log("Liquidity Pool contract address: ", liquidityPool.address);

    const SpaceRouter = await ethers.getContractFactory("SpaceRouter");
    spaceRouter = await SpaceRouter.connect(owner).deploy(liquidityPool.address, spaceCoinICO.address);
    await spaceRouter.deployed();
    console.log("Space Router contract address: ", spaceRouter.address);
  });

  describe("mint", function () {
    beforeEach(async function () {
      await spaceCoinICO.connect(owner).changeICOStage(1);
      await spaceCoinICO.connect(owner).changeICOStage(2);
      await spaceCoinICO.connect(alice).investInSPC({ value: ethers.utils.parseEther("1500") });
      await spaceCoinICO.connect(bob).investInSPC({ value: ethers.utils.parseEther("1000") });
    });

    it("mint before deposit", async function () {
      await expect(liquidityPool.connect(owner).mint(alice.address)).to.be.revertedWith("NO_LIQUIDITY");
    });

    it("mint after deposit only ETH", async function () {
      const tx = {
        to: liquidityPool.address,
        value: ethers.utils.parseEther("100"),
        gasLimit: 500000
      };
      await alice.sendTransaction(tx);
      await expect(liquidityPool.connect(owner).mint(alice.address)).to.be.revertedWith("NO_LIQUIDITY");
    });

    it("mint after deposit only SPC", async function () {
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("500"));
      await expect(liquidityPool.connect(owner).mint(alice.address)).to.be.revertedWith("NO_LIQUIDITY");
    });

    it("mint after deposit", async function () {
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("500"));
      await spaceCoinICO.connect(owner).withdrawFund(treasury.address);

      const tx = {
        to: liquidityPool.address,
        value: ethers.utils.parseEther("100"),
        gasLimit: 500000
      };
      await alice.sendTransaction(tx);
      const txReceipt = await (await liquidityPool.connect(owner).mint(alice.address)).wait();
      liquidity = txReceipt.events?.find(event => event.event === "Mint")?.args![2];

      await expect(txReceipt).to.emit(liquidityPool, "Mint").withArgs(owner.address, alice.address, liquidity);
    });
  });

  describe("burn", function () {
    beforeEach(async function () {
      await spaceCoinICO.connect(owner).changeICOStage(1);
      await spaceCoinICO.connect(owner).changeICOStage(2);
      await spaceCoinICO.connect(alice).investInSPC({ value: ethers.utils.parseEther("1500") });
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("500"));
      await spaceCoinICO.connect(owner).withdrawFund(treasury.address);

      const tx = {
        to: liquidityPool.address,
        value: ethers.utils.parseEther("100"),
        gasLimit: 500000
      };
      await alice.sendTransaction(tx);

      const txReceipt = await (await liquidityPool.connect(alice).mint(alice.address)).wait();
      liquidity = txReceipt.events?.find(event => event.event === "Mint")?.args![2];
    });

    it("burn liquidity by someone who didn't add liquidity before", async function () {
      await expect(liquidityPool.connect(treasury).burn(bob.address)).to.be.revertedWith("INSUFFICIENT_LIQUIDITY_BURNED");
    });

    it("burn liquidity by someone who added liquidity before", async function () {
      await liquidityPool.connect(alice).transfer(liquidityPool.address, liquidity);
      await expect(liquidityPool.connect(treasury).burn(alice.address))
        .to.emit(liquidityPool, "Burn")
        .withArgs(treasury.address, alice.address, liquidity, liquidity.div(5));
    });
  });

  describe("swap SPC to ETH", function () {
    beforeEach(async function () {
      await spaceCoinICO.connect(owner).changeICOStage(1);
      await spaceCoinICO.connect(owner).changeICOStage(2);
      await spaceCoinICO.connect(alice).investInSPC({ value: ethers.utils.parseEther("1500") });
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("500"));
      await spaceCoinICO.connect(owner).withdrawFund(treasury.address);

      const tx = {
        to: liquidityPool.address,
        value: ethers.utils.parseEther("100"),
        gasLimit: 500000
      };
      await alice.sendTransaction(tx);

      const txReceipt = await (await liquidityPool.connect(alice).mint(alice.address)).wait();
      liquidity = txReceipt.events?.find(event => event.event === "Mint")?.args![2];
    });

    it("send zero(0) SPC to swap", async function () {
      await expect(liquidityPool.connect(treasury).swapSPCtoETH(ethers.utils.parseEther("0"), alice.address))
        .to.be.revertedWith("INSUFFICIENT_OUTPUT_AMOUNT");
    });

    it("swap when there is zero liquidity", async function () {
      await liquidityPool.connect(alice).transfer(liquidityPool.address, liquidity);
      await liquidityPool.connect(alice).burn(alice.address);
      await expect(liquidityPool.connect(treasury).swapSPCtoETH(ethers.utils.parseEther("5"), alice.address))
        .to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
    });

    it("swap without burning the liquidity : INVALID_K", async function () {
      await expect(liquidityPool.connect(treasury).swapSPCtoETH(ethers.utils.parseEther("5"), alice.address))
        .to.be.revertedWith("INVALID_K");
    });

    it("swap to liquidityPool.address/ spaceCoinICO.address only", async function () {
      await expect(liquidityPool.connect(treasury).swapSPCtoETH(ethers.utils.parseEther("5"), liquidityPool.address))
        .to.be.revertedWith("INVALID_TO_ADDRESS");
      await expect(liquidityPool.connect(treasury).swapSPCtoETH(ethers.utils.parseEther("5"), spaceCoinICO.address))
        .to.be.revertedWith("INVALID_TO_ADDRESS");
    });

    it("swap SPC => ETH", async function () {
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("5"));
      let ethBalance = await ethers.provider.getBalance(alice.address);

      const estimatedTrade = await spaceRouter.getEstimatedTradeVal(ethers.utils.parseEther("5"), 0);
      let ethAmountOut = estimatedTrade[1];

      await liquidityPool.connect(treasury).swapSPCtoETH(ethAmountOut, alice.address);
      ethBalance = ethBalance.add(ethAmountOut);
      expect(await ethers.provider.getBalance(alice.address)).to.equal(ethBalance);
    });
  });

  describe("swap ETH to SPC", function () {
    beforeEach(async function () {
      await spaceCoinICO.connect(owner).changeICOStage(1);
      await spaceCoinICO.connect(owner).changeICOStage(2);
      await spaceCoinICO.connect(alice).investInSPC({ value: ethers.utils.parseEther("1500") });
      await spaceCoinICO.connect(alice).transfer(liquidityPool.address, ethers.utils.parseEther("500"));
      await spaceCoinICO.connect(owner).withdrawFund(treasury.address);

      const tx = {
        to: liquidityPool.address,
        value: ethers.utils.parseEther("100"),
        gasLimit: 500000
      };
      await alice.sendTransaction(tx);

      const txReceipt = await (await liquidityPool.connect(alice).mint(alice.address)).wait();
      liquidity = txReceipt.events?.find(event => event.event === "Mint")?.args![2];
    });

    it

