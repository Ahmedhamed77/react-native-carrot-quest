package com.margelo.nitro.carrotquest
  
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class CarrotQuest : HybridCarrotQuestSpec() {
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
