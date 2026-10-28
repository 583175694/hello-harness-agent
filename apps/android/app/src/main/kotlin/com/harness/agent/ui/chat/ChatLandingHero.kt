package com.harness.agent.ui.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.harness.agent.R
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle

@Composable
fun ChatLandingHero(
    welcomeText: String,
    modifier: Modifier = Modifier,
    showDemoEntry: Boolean = false,
    onOpenDemo: () -> Unit = {},
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(id = R.drawable.brand_icon_app),
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                contentScale = ContentScale.Fit,
            )
            AppText(
                text = welcomeText,
                style = AppTextStyle.Body,
                modifier = Modifier.padding(start = 14.dp),
            )
        }
        if (showDemoEntry) {
            AppText(
                text = "加载演示 Mock（对话 + 工作台）",
                style = AppTextStyle.Link,
                modifier =
                    Modifier
                        .padding(top = 16.dp)
                        .clickable(onClick = onOpenDemo)
                        .testTag("landing-load-demo-mock"),
            )
            AppText(
                text = "或：设置 → 演示场景",
                style = AppTextStyle.Muted,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
